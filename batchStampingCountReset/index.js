// This Lambda function is Git controlled.
const aws = require('aws-sdk');
const dynamo = new aws.DynamoDB();

exports.handler = async (event) => {
    const users = await queryAllUsers();
    await batchResetStampingCount(users.Items);
};

/**
 * Fetch all users
 */
const queryAllUsers = async () => {
    const param = {
        "TableName": 'users',
    }
    const res = await dynamo.scan(param).promise();
    return res;
}

const batchResetStampingCount = async (users) => {
    for (const user of users) {
        const param = {
            "TableName": 'users',
            "Key": {
                "company_id"  : { S: user.company_id.S },
                "line_user_id": { S: user.line_user_id.S },
            },
            "UpdateExpression": `
                set
                #item1 = :val1
                `,
            "ExpressionAttributeNames": {
                '#item1': 'stamping_count'
            },
            "ExpressionAttributeValues": {
                ':val1': { S: "0" },
            },
        };
        try {
            await dynamo.updateItem(param).promise();
        } catch (e) {
            console.log(e);
        }
    }
}
