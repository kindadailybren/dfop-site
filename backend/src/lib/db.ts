import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION ?? 'ap-southeast-1';

const baseClient = new DynamoDBClient({
  region,
  maxAttempts: 3,
});

export const docClient = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
});

export function getTableName(): string {
  return process.env.TABLE_NAME ?? 'DfopTable';
}
