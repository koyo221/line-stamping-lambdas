// This Lambda function is Git controlled.
const aws = require('aws-sdk');
const dynamo = new aws.DynamoDB();
const axios = require('axios');

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Headers" : "Content-Type",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
    }

    const body = JSON.parse(event.body);
    const companyId = body.company_id;
    const users = body.accounts;

    // If body does not have company id, return 400.
    if (!companyId) {
        return {
            "statusCode": 400,
            "body": JSON.stringify({ error: "Invalid request." }),
            "headers": headers,
            "isBase64Encoded": false,
        }
    }

    // Get company information
    const dynamoDbQueryParams = {
        "TableName": 'companies',
        "KeyConditionExpression": "#pk_name = :pk_prm",
        "ExpressionAttributeNames": {"#pk_name": "id"},
        "ExpressionAttributeValues": { ":pk_prm": {S: companyId}}
    }

    const company = await dynamo.query(dynamoDbQueryParams).promise();

    const kotAccessToken = company.Items[0].kot_token.S;
    if (!kotAccessToken) {
        return {
            "statusCode": 400,
            "body": JSON.stringify({ error: "Failed to get access token." }),
            "headers": headers,
            "isBase64Encoded": false,
        }
    }

    for (const user of users) {
        // Execute King of Time API and fetch Data
        const kotHeader = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${kotAccessToken}`,
        }

        const employeeCode = user.employee_code;
        if (!employeeCode) continue;

        // Make sure VPC and NAT gateway is enabled in AWS console
        let responseFromKot
        try {
            responseFromKot = await axios.get(
                `https://api.kingtime.jp/v1.0/employees/${employeeCode}`,
                {headers: kotHeader},
            )
            console.log(responseFromKot);
        } catch (e) {
            console.log(e);
            return {
                "statusCode": 500,
                "body": JSON.stringify({ error: "Server error." }),
                "headers": headers,
                "isBase64Encoded": false,
            }
        }

        const [employeeName, employeeKey] = [
            `${responseFromKot.data.lastName}${responseFromKot.data.firstName}`,
            responseFromKot.data.key
        ]

        const dynamoDbUpdateItemParams = {
            "TableName": 'users',
            "Key": {
                "company_id"  : { S: companyId },
                "line_user_id": { S: user.line_user_id },
            },
            "UpdateExpression": `
                set
                #item1 = :val1,
                #item2 = :val2,
                #item3 = :val3
                `,
            "ExpressionAttributeNames": {
                '#item1': 'employee_code',
                '#item2': 'employee_key',
                '#item3': 'employee_name',
            },
            "ExpressionAttributeValues": {
                ':val1': { S: employeeCode },
                ':val2': { S: employeeKey },
                ':val3': { S: employeeName }
            },
        };

        await dynamo.updateItem(dynamoDbUpdateItemParams).promise();
    }
    const response = {
        "statusCode": 200,
        "body": "Update success.",
        "headers": headers,
        "isBase64Encoded": false,
    }
    return response;
}
