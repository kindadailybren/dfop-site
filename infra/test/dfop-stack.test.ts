import { describe, it } from 'node:test';
import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DfopStack } from '../lib/dfop-stack.js';

describe('DfopStack CDK Infrastructure', () => {
  it('synthesizes DynamoDB table, Cognito UserPool, HTTP API, S3 Bucket, and CloudFront distribution with custom domain cert', () => {
    const app = new cdk.App();
    const stack = new DfopStack(app, 'TestDfopStack', {
      env: { account: '123456789012', region: 'ap-southeast-1' },
      domainName: 'dfop.breindel.me',
      acmCertificateArn:
        'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000',
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.resourceCountIs('AWS::S3::Bucket', 1);
    template.resourceCountIs('AWS::CloudFront::Distribution', 1);

    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Aliases: ['dfop.breindel.me'],
      },
    });
  });
});
