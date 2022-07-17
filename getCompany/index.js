// This Lambda function is Git controlled.
const aws = require('aws-sdk');
const dynamo = new aws.DynamoDB();

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Headers" : "Content-Type",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
    }

    const id = event?.queryStringParameters?.id;
    const dynamoDbQueryParams = {
        "TableName": 'companies',
        "KeyConditionExpression": "#pk_name = :pk_prm",
        "ExpressionAttributeNames": {"#pk_name": "id"},
        "ExpressionAttributeValues": { ":pk_prm": {S: id}}
    }

    let company
    try {
        company = await dynamo.query(dynamoDbQueryParams).promise();
        if (!company) throw('No companies found.');
    } catch (e) {
        console.log(e);
        return {
            "statusCode": 404,
            "body": "No companies found.",
            "headers": headers,
            "isBase64Encoded": false,
        }
    }

    const body = {
        "id": company.Items[0].id.S,
        "kot_token": company.Items[0].kot_token.S,
        "line_token": company.Items[0].line_token.S
    }

    const response = {
        "statusCode": 200,
        "body": JSON.stringify(body),
        "headers": headers,
        "isBase64Encoded": false,
    }
    return response;
}
