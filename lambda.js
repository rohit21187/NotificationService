const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
    DynamoDBDocumentClient,
    PutCommand,
    DeleteCommand, ScanCommand
} = require("@aws-sdk/lib-dynamodb");
const {
    ApiGatewayManagementApiClient,
    PostToConnectionCommand,
} = require("@aws-sdk/client-apigatewaymanagementapi");
const log = require('lambda-log');
const app = require("./index.js");
const serverless = require("serverless-http");
const client = new DynamoDBClient({ region: "ap-south-1" });
const dynamoDbClient = DynamoDBDocumentClient.from(client);
let callbackUrl;
let clientApi;
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
        log.error(error);
    }
}

module.exports.socket = async (event, context, callback)=>{
    log.info(event);
    let reqConnectionId,domain,stage;
    if(event.requestContext.connectionId)
        reqConnectionId = event.requestContext.connectionId;
    if(event.requestContext.domainName)
        domain = event.requestContext.domainName;
    if(event.requestContext.stage)
        stage = event.requestContext.stage;
    const route = event.requestContext.routeKey;
    log.info(reqConnectionId, domain, stage);
    log.info(route);
    switch (route) {
        case '$connect':
            const params = {
                TableName: 'users-table',
                Item: {
                    connectionId: reqConnectionId
                },
            };
            try {
                await dynamoDbClient.send(new PutCommand(params));
                callbackUrl = `https://${domain}/${stage}`;
                log.info(callbackUrl)
                clientApi = new ApiGatewayManagementApiClient({endpoint: callbackUrl});
                log.info('WebSocket connected:', reqConnectionId);
                callback(null, {statusCode: 200});
            } catch (e) {
                log.info("unable to connect", e);
            }
            break;

        case '$disconnect':
            const param = {
                TableName: 'users-table',
                Key: {
                    connectionId: reqConnectionId
                },
            };
            try {
                log.info("removing from db", param);
                await dynamoDbClient.send(new DeleteCommand(param));
                log.info('WebSocket disconnected:', reqConnectionId)
                callback(null, {statusCode: 200});
            } catch (e) {
                log.info("unable to disconnect\n");
                log.error(e);
            }
            break;
        case 'sendToAll':
            log.info("in send to all", event)
            const eve = JSON.parse(event.body);
            log.info(eve.message, eve.secretKey);
            callbackUrl = `https://${domain}/${stage}`;
            clientApi = new ApiGatewayManagementApiClient({endpoint: callbackUrl});
            if (eve.secretKey && eve.secretKey === 'testing') {
                log.info(eve);
                const command = new ScanCommand({TableName: 'users-table'});
                const response = await client.send(command);
                // response.Items.map(async (connection) => {
                //     log.info(connection.connectionId);
                //     await handleMessage(connection.connectionId, eve.message);
                // });
                const connections = response.Items.map(connection => {
                    return connection.connectionId;
                });
                const handleMessagePromises = connections.map(connectionId => {
                    log.info(connectionId);
                    return handleMessage(connectionId, eve.message);
                });
                try {
                    await Promise.all(handleMessagePromises);
                    log.info("sent to all users");
                } catch (e) {
                    log.error(e);
                }
            }
            callback(null, {statusCode: 200});
            break;
        case '$default':
            log.info("in default");
            await handleMessage(reqConnectionId, event.body);
            callback(null, {statusCode: 200});
            break;
        default:
            log.info("into post wala default");
            const postEvent = JSON.parse(event.body);
            log.info(postEvent.message);
            log.info(postEvent);
            const command = new ScanCommand({TableName: 'users-table'});
            const response = await client.send(command);
            const connections = response.Items.map(connection => {
                return connection.connectionId;
            });
            const handleMessagePromises = connections.map(connectionId => {
                log.info(connectionId);
                return handleMessage(connectionId, postEvent.message);
            });
            try {
                await Promise.all(handleMessagePromises);
                log.info("sent to all users");
            } catch (e) {
                log.error(e);
            }
            callback(null,{statusCode: 200,body:"sent successfully"});
            break;
    }
}
module.exports.notification = serverless(app);