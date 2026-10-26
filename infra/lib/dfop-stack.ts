import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveBackendEntry(): string {
  const candidates = [
    path.resolve(__dirname, '../../backend/src/handlers/apiHandler.ts'),
    path.resolve(__dirname, '../../../backend/src/handlers/apiHandler.ts'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

export interface DfopStackProps extends cdk.StackProps {
  domainName?: string;
  acmCertificateArn?: string;
}

export class DfopStack extends cdk.Stack {
  public readonly table: dynamodb.Table;
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly frontendBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: DfopStackProps) {
    super(scope, id, props);

    const customDomain = props?.domainName ?? 'dfop.breindel.me';
    const acmCertificateArn = props?.acmCertificateArn;
    const isEphemeral = process.env.DESTROY_ON_DELETE === 'true';

    // -------------------------------------------------------------------------
    // 1. DynamoDB Single-Table (Players, Active & Completed Sessions, Games)
    // -------------------------------------------------------------------------
    this.table = new dynamodb.Table(this, 'DfopTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: true,
      },
      removalPolicy: isEphemeral
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // -------------------------------------------------------------------------
    // 2. Amazon Cognito User Pool (Admin-only Authentication)
    // -------------------------------------------------------------------------
    this.userPool = new cognito.UserPool(this, 'DfopAdminUserPool', {
      userPoolName: `${this.stackName}-AdminUserPool`,
      selfSignUpEnabled: false,
      signInAliases: {
        email: true,
        username: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: isEphemeral
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient('DfopAdminWebClient', {
      userPoolClientName: `${this.stackName}-AdminWebClient`,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      accessTokenValidity: cdk.Duration.hours(12),
      idTokenValidity: cdk.Duration.hours(12),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    // -------------------------------------------------------------------------
    // 3. Backend Lambda Function (Node.js 20, ARM64, esbuild bundled)
    // -------------------------------------------------------------------------
    const backendEntry = resolveBackendEntry();

    const apiLogGroup = new logs.LogGroup(this, 'DfopApiLogGroup', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: isEphemeral
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
    });

    const apiFunction = new nodejs.NodejsFunction(this, 'DfopApiFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      entry: backendEntry,
      handler: 'handler',
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      logGroup: apiLogGroup,
      environment: {
        TABLE_NAME: this.table.tableName,
        ALLOWED_ORIGIN: `https://${customDomain}`,
        NODE_OPTIONS: '--enable-source-maps',
      },
      bundling: {
        format: nodejs.OutputFormat.ESM,
        target: 'node20',
        minify: true,
        sourceMap: true,
        externalModules: ['@aws-sdk/*'],
        banner:
          "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });

    this.table.grantReadWriteData(apiFunction);

    // -------------------------------------------------------------------------
    // 4. API Gateway HTTP API v2 + Cognito JWT Authorizer
    // -------------------------------------------------------------------------
    this.httpApi = new apigwv2.HttpApi(this, 'DfopHttpApi', {
      apiName: `${this.stackName}-HttpApi`,
      corsPreflight: {
        allowOrigins: [
          `https://${customDomain}`,
          'http://localhost:5173',
          'http://localhost:4173',
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const lambdaIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      'DfopApiIntegration',
      apiFunction
    );

    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      'DfopCognitoAuthorizer',
      this.userPool.userPoolProviderUrl,
      {
        jwtAudience: [this.userPoolClient.userPoolClientId],
      }
    );

    // Public routes (no auth required for players pitch-side)
    const publicRoutes: Array<{ path: string; method: apigwv2.HttpMethod }> = [
      { path: '/api/health', method: apigwv2.HttpMethod.GET },
      { path: '/api/state', method: apigwv2.HttpMethod.GET },
      { path: '/api/players', method: apigwv2.HttpMethod.GET },
      { path: '/api/sessions', method: apigwv2.HttpMethod.GET },
      { path: '/api/sessions/{sessionId}', method: apigwv2.HttpMethod.GET },
    ];

    for (const route of publicRoutes) {
      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: lambdaIntegration,
      });
    }

    // Admin routes (protected by Cognito JWT Authorizer)
    const adminRoutes: Array<{ path: string; method: apigwv2.HttpMethod }> = [
      { path: '/api/admin/csv/preview', method: apigwv2.HttpMethod.POST },
      { path: '/api/admin/sessions', method: apigwv2.HttpMethod.POST },
      {
        path: '/api/admin/sessions/{sessionId}/participants',
        method: apigwv2.HttpMethod.PUT,
      },
      {
        path: '/api/admin/sessions/{sessionId}/generate-teams',
        method: apigwv2.HttpMethod.POST,
      },
      {
        path: '/api/admin/sessions/{sessionId}/games',
        method: apigwv2.HttpMethod.POST,
      },
      {
        path: '/api/admin/sessions/{sessionId}/games/{gameId}',
        method: apigwv2.HttpMethod.PUT,
      },
      {
        path: '/api/admin/sessions/{sessionId}/finalize',
        method: apigwv2.HttpMethod.POST,
      },
      {
        path: '/api/admin/players/{playerId}',
        method: apigwv2.HttpMethod.PUT,
      },
    ];

    for (const route of adminRoutes) {
      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: lambdaIntegration,
        authorizer: jwtAuthorizer,
      });
    }

    // -------------------------------------------------------------------------
    // 5. Frontend S3 Bucket + CloudFront Distribution (dfop.breindel.me)
    // -------------------------------------------------------------------------
    this.frontendBucket = new s3.Bucket(this, 'DfopFrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: isEphemeral
        ? cdk.RemovalPolicy.DESTROY
        : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: isEphemeral,
    });

    const apiOriginDomain = `${this.httpApi.apiId}.execute-api.${this.region}.${this.urlSuffix}`;
    const apiOrigin = new origins.HttpOrigin(apiOriginDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const certificate = acmCertificateArn
      ? acm.Certificate.fromCertificateArn(
          this,
          'DfopCustomDomainCert',
          acmCertificateArn
        )
      : undefined;

    this.distribution = new cloudfront.Distribution(this, 'DfopDistribution', {
      comment: `DFOP Davao Football Open Play (${customDomain})`,
      defaultRootObject: 'index.html',
      domainNames: certificate ? [customDomain] : undefined,
      certificate,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(
          this.frontendBucket
        ),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });

    const frontendDistCandidates = [
      path.resolve(__dirname, '../../frontend/dist'),
      path.resolve(__dirname, '../../../frontend/dist'),
    ];
    const frontendDistPath = frontendDistCandidates.find((p) =>
      fs.existsSync(p)
    );

    if (frontendDistPath) {
      new s3deploy.BucketDeployment(this, 'DfopFrontendDeployment', {
        sources: [s3deploy.Source.asset(frontendDistPath)],
        destinationBucket: this.frontendBucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
      });
    }

    // -------------------------------------------------------------------------
    // 6. Stack Outputs (for External DNS CNAME & GitHub Actions CI/CD)
    // -------------------------------------------------------------------------
    new cdk.CfnOutput(this, 'FrontendBucketName', {
      value: this.frontendBucket.bucketName,
      description: 'S3 Bucket for DFOP Frontend SPA assets',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID for cache invalidation in CI/CD',
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: this.distribution.distributionDomainName,
      description: `Point your external DNS CNAME (${customDomain}) to this CloudFront domain`,
    });

    new cdk.CfnOutput(this, 'CustomDomainName', {
      value: customDomain,
      description: 'Configured DFOP custom domain name',
    });

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: this.httpApi.apiEndpoint,
      description: 'Direct API Gateway HTTP API endpoint URL',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID for DFOP Admin auth',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Web Client ID for DFOP Admin auth',
    });

    new cdk.CfnOutput(this, 'DynamoDbTableName', {
      value: this.table.tableName,
      description: 'DynamoDB single-table name',
    });
  }
}
