// This Lambda function is Git controlled.
const aws = require('aws-sdk');
const dynamo = new aws.DynamoDB();

exports.handler = async (event) => {
    const companyId = event?.queryStringParameters?.id;
    const headers = {
        "Access-Control-Allow-Headers" : "Content-Type",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS"
    }

    // If query parameter does not have company id, return 400.
    if (!companyId) {
        return {
            "statusCode": 400,
            "body": JSON.stringify({ error: "Please specify id." }),
            "headers": headers,
            "isBase64Encoded": false,
        }
    }

    const dynamoDbQueryParams = {
        "TableName": 'users',
        "KeyConditionExpression": "#pk_name = :pk_prm",
        "ExpressionAttributeNames": {"#pk_name": "company_id"},
        "ExpressionAttributeValues": { ":pk_prm": {S: companyId}}
    }

    const users = await dynamo.query(dynamoDbQueryParams).promise();

    // Create parameter
    const accounts = [];
    for (const user of users.Items) {
        const accountParam = {
            "line_user_id": user.line_user_id.S,
            "line_display_name": user.line_display_name.S,
            "employee_key": user.employee_key.S || '',
            "employee_code": user.employee_code.S || '',
            "employee_name": user.employee_name.S || '',
        }
        accounts.push(accountParam);
    }

    const body = {
        "accounts": accounts,
    }

    const response = {
        "statusCode": 200,
        "body": JSON.stringify(body),
        "headers": headers,
        "isBase64Encoded": false,
    }
    return response;
}
