# Davao Football Open Play (DFOP) — Matchday Team Maker & Stats Tracker

Monorepo for **Davao Football Open Play (`dfop.breindel.me`)**:
- **`packages/shared` (`@dfop/shared`)**: Domain types, CSV parser (`Name, Skill, Preferred Position`), fuzzy player matcher, dynamic 7/9/11-a-side Team Maker engine (prioritizing fewest games played today + skill & positional line balancing + manual pins/swaps), and player performance index / leaderboard calculator.
- **`backend` (`@dfop/backend`)**: AWS Lambda API handler (`APIGatewayProxyEventV2`) + DynamoDB single-table repository (`@aws-sdk/client-dynamodb` / `@aws-sdk/lib-dynamodb`) + local development server (`localhost:4000`).
- **`frontend` (`@dfop/frontend`)**: React 18 + Vite + TypeScript + Tailwind CSS matchday web application built around the Davao Football Open Play crest (`dfoplogo.png`).
- **`infra` (`@dfop/infra`)**: AWS CDK v2 stack (`DfopStack` in `ap-southeast-1`) provisioning DynamoDB, Cognito User Pool (Admin-only), API Gateway HTTP API v2 + JWT Authorizer, Lambda (`NodejsFunction`), S3 Bucket, and CloudFront Distribution for `dfop.breindel.me`.
- **`.github/workflows/deploy.yml`**: Path-filtered GitHub Actions CI/CD workflow.

---

## Local Development

```bash
# 1. Install dependencies across all workspaces
npm install

# 2. Run unit & integration tests across shared, backend, and CDK infra
npm test

# 3. Start the local backend API server (port 4000, pre-seeded with DFOP demo session)
npm run dev:backend

# 4. In another terminal, start the Vite frontend dev server (port 5173)
npm run dev:frontend
```

---

## CSV Format for Sessions

Upload a `.csv` file in the Admin Console (or click **Download Sample CSV**) with the following columns:

```csv
Name,Skill,Preferred Position
Marco Santos,Advanced,MID
Paolo Reyes,Advanced,FWD
Enzo Villanueva,Intermediate,DEF
Carlo Mendoza,Intermediate,GK
```

- **Skill**: `Beginner`, `Intermediate`, or `Advanced`
- **Preferred Position**: `GK`, `DEF`, `MID`, `FWD`, or `ANY`
- **Returning Players**: Matched case-insensitively by normalized name. Their `Skill` and `Preferred Position` are updated from the latest CSV while preserving their all-time stats. Similar names (edit distance <= 2) are flagged in the Admin UI so you can link them with one click.

---

## AWS CDK Deployment & Custom Domain (`dfop.breindel.me`)

Since DNS for `breindel.me` is managed outside Route 53 (e.g., Cloudflare / Namecheap):

1. **Create an ACM Certificate in `us-east-1`** (CloudFront requires certificates in `us-east-1`):
   ```bash
   aws acm request-certificate \
     --domain-name dfop.breindel.me \
     --validation-method DNS \
     --region us-east-1
   ```
   Add the validation CNAME record shown in the ACM console to your DNS provider until the certificate status is `ISSUED`.

2. **Deploy the CDK Stack (`ap-southeast-1`)**:
   ```bash
   export AWS_REGION=ap-southeast-1
   export ACM_CERTIFICATE_ARN="arn:aws:acm:us-east-1:<ACCOUNT_ID>:certificate/<CERT_ID>"
   npm run cdk:deploy
   ```

3. **Point your External DNS CNAME**:
   Copy the `CloudFrontDomainName` output from `cdk deploy` (e.g. `d111111abcdef8.cloudfront.net`) and create a CNAME record in your DNS provider:
   - **Name**: `dfop`
   - **Target**: `<CloudFrontDomainName>` (if using Cloudflare, set Proxy status to **DNS Only** or **Full (Strict)** SSL).

4. **Create your Admin User in Cognito**:
   ```bash
   USER_POOL_ID="<CognitoUserPoolId output>"
   aws cognito-idp admin-create-user \
     --user-pool-id "$USER_POOL_ID" \
     --username "admin@dfop.breindel.me" \
     --user-attributes Name=email,Value=admin@dfop.breindel.me Name=email_verified,Value=true \
     --message-action SUPPRESS

   aws cognito-idp admin-set-user-password \
     --user-pool-id "$USER_POOL_ID" \
     --username "admin@dfop.breindel.me" \
     --password "YourStrongPassword123" \
     --permanent
   ```

---

## GitHub Actions CI/CD Configuration

The workflow in `.github/workflows/deploy.yml` uses `dorny/paths-filter` to detect changed files:
- Changes in `backend/**`, `infra/**`, or `packages/shared/**` trigger `cdk deploy DfopStack`.
- Changes in `frontend/**`, `infra/**`, or `packages/shared/**` build the React SPA, sync `frontend/dist` to S3, and invalidate CloudFront.

Configure the following in your GitHub repository (**Settings -> Secrets and variables -> Actions**):
- **Secrets**:
  - `AWS_ROLE_ARN` (recommended OIDC IAM role ARN) **or** `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`
  - `ACM_CERTIFICATE_ARN` (your `us-east-1` ACM certificate ARN for `dfop.breindel.me`)
- **Variables (optional)**:
  - `AWS_REGION` (defaults to `ap-southeast-1`)
  - `DOMAIN_NAME` (defaults to `dfop.breindel.me`)
