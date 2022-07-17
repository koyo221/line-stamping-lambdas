// This Lambda function is Git controlled.
const aws = require('aws-sdk');
const dynamo = new aws.DynamoDB();

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Headers" : "Content-Type",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    }

    const id = event.id
    const [kotToken, lineToken] = [
        event.kot_token,
        event.line_token
    ];

    console.log(id, kotToken, lineToken);

    if (!kotToken && !lineToken) {
        return {
            "statusCode": 405,
            "body": JSON.stringify({ error: "No information given." }),
            "headers": headers,
            "isBase64Encoded": false,
        }
    }

    if (kotToken) {
        const dynamoDbUpdateKotParams = {
            "TableName": 'companies',
            "Key": {
                "id"  : { S: id }
            },
            "UpdateExpression": `
                set
                #item1 = :val1
                `,
            "ExpressionAttributeNames": {
                '#item1': 'kot_token',
            },
            "ExpressionAttributeValues": {
                ':val1': { S: kotToken }
            },
        };

        await dynamo.updateItem(dynamoDbUpdateKotParams).promise();
    }

    if (lineToken) {
        const dynamoDbUpdateLineParams = {
            "TableName": 'companies',
            "Key": {
                "id"  : { S: id }
            },
            "UpdateExpression": `
                set
                #item1 = :val1
                `,
            "ExpressionAttributeNames": {
                '#item1': 'line_token',
            },
            "ExpressionAttributeValues": {
                ':val1': { S: lineToken }
            },
        };

        await dynamo.updateItem(dynamoDbUpdateLineParams).promise();
    }

    const response = {
        "statusCode": 200,
        "body": "Update success.",
        "headers": headers,
        "isBase64Encoded": false,
    }

    return response;
}
