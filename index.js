const express = require("express");
const {DynamoDBClient, } = require("@aws-sdk/client-dynamodb");
const {ScanCommand} = require("@aws-sdk/lib-dynamodb");
const {PostToConnectionCommand, ApiGatewayManagementApiClient} = require("@aws-sdk/client-apigatewaymanagementapi");
const log = require("lambda-log");
const app = express();

const client = new DynamoDBClient({ region: "ap-south-1" });
const callbackUrl="https://o0rrwfwzac.execute-api.ap-south-1.amazonaws.com/dev"
const clientApi = new ApiGatewayManagementApiClient({ endpoint: callbackUrl });
app.use(express.json());
log.info("in index");
async function handleMessage(connectionId, body) {
  const requestParams = {
    ConnectionId: connectionId,
    Data: body,
  };
  log.info(requestParams);

  const command = new PostToConnectionCommand(requestParams);

  try {
    await clientApi.send(command);
  } catch (error) {
    log.info(error);
  }

  return {
    statusCode: 200,
  };
}
app.post("/api/admin/send-notification", async function (req, res) {
  const command = new ScanCommand({TableName: 'users-table'});
  const response = await client.send(command);
  await Promise.all([response.Items.map(async (connection) => {
    await handleMessage(connection.connectionId, req.body.message);
  })]);
  res.status(200).json("sent successfully");
});
app.post("/api/admin/direct/send-notification", async function (req, res) {
  const command = new ScanCommand({TableName: 'users-table'});
  const response = await client.send(command);
  await Promise.all([response.Items.map(async (connection) => {
    await handleMessage(connection.connectionId, req.body.message);
  })]);
  res.status(200).json("sent successfully");
});

app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});

module.exports = app;
