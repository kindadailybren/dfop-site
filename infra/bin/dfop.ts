#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DfopStack } from '../lib/dfop-stack.js';

const app = new cdk.App();

const region =
  process.env.AWS_REGION ||
  process.env.CDK_DEFAULT_REGION ||
  'ap-southeast-1';

const account =
  process.env.AWS_ACCOUNT_ID ||
  process.env.CDK_DEFAULT_ACCOUNT;

const domainName =
  app.node.tryGetContext('domainName') ||
  process.env.DOMAIN_NAME ||
  'dfop.breindel.me';

const acmCertificateArn =
  app.node.tryGetContext('acmCertificateArn') ||
  process.env.ACM_CERTIFICATE_ARN ||
  undefined;

new DfopStack(app, 'DfopStack', {
  env: {
    account,
    region,
  },
  domainName,
  acmCertificateArn,
  description: 'Davao Football Open Play (DFOP) — Matchday Team Maker, Live Tracker & Stats Infrastructure',
});
