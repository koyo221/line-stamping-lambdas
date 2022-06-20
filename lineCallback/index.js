// This Lambda function is Git controlled.

const matcher = require('./matcher.js')

const axios = require('axios');
const aws = require('aws-sdk');
const dynamo = new aws.DynamoDB();

exports.handler = async (event) => {

    // Create response for line webhook
    const response = {
        statusCode: 200,
        body: '',
    };

    // Get company id from query string (set from line dev console)
    const id = event?.queryStringParameters?.id;
    if (!id) {
        console.log("Set id from line dev console.")
        return response;
    }

    const dynamoDbQueryParams = {
        "TableName": 'companies',
        "KeyConditionExpression": "#pk_name = :pk_prm",
        "ExpressionAttributeNames": {"#pk_name": "id"},
        "ExpressionAttributeValues": { ":pk_prm": {S: id}}
    }
    let company
    try {
        company = await dynamo.query(dynamoDbQueryParams).promise();
        if (!company) throw('No company found.');
    } catch (e) {
        console.log(e);
        // Always return 200 for line webhook event
        return response;
    }

    console.log(`Company Data: ${JSON.stringify(company)}, ID: ${id}`)
    console.log(`Request Body: ${event.body}`);

    // Request from LINE
    const request = JSON.parse(event.body);

    // Create reply message
    const reply = {
        "replyToken": request.events[0].replyToken,
        "messages": [
            {
                "type": "text",
                "text": await matcher.match(request, company)
            }
        ]
    }

    // Post reply
    try {
        await axios.post(
            "https://api.line.me/v2/bot/message/reply",
            reply,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${company.Items[0].line_token.S}`
                }
            }
        ).then(() => console.log(`Reply sent: ${JSON.stringify(reply)}`))
    } catch (e) {
        console.log(`Error occurred: ${e}`);
    }

    // Always return 200 for line webhook event
    return response;
};
