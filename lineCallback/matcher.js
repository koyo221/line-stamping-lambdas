const axios = require('axios');
const aws = require('aws-sdk');
const dynamo = new aws.DynamoDB();

/**
 * Handle message and returns response
 *
 * @param requestFromLine
 * @param company
 */
exports.match = async (requestFromLine, company) => {
    const lineUserId = requestFromLine.events[0].source.userId;
    const kotAccessToken = company.Items[0].kot_token.S;
    const companyId = company.Items[0].id.S;
    const lineProfile = await axios.get(
        `https://api.line.me/v2/bot/profile/${lineUserId}`,
        {
            headers: {
                'Authorization': `Bearer ${company.Items[0].line_token.S}`
            }
        });
    const lineDisplayName = lineProfile.data.displayName;
    const isExist = await isExistingUser(companyId, lineUserId, lineDisplayName);
    if (!isExist) {
        return "ユーザー登録が完了しました。"
    } else if (isExist === "Error") {
        return "エラーが発生しました。"
    }

    const message = requestFromLine.events[0].message.text;

    // if (isStamping()) {
    //     return handleStamping(lineUserId, kotAccessToken);
    // }

    const workTimes = isWorkTimeSubmit(message);
    if (workTimes) {
        const resWorkTime = await handleWorkTime(workTimes, companyId, lineUserId, lineDisplayName);
        if (resWorkTime === "Error") {
            return "エラーが発生しました。";
        }
        return "時刻を更新しました。";
    }

    return "test end"
}

/**
 * Check if user is existing. If not, register.
 *
 * @param  companyId
 * @param  lineUserId
 * @param  lineDisplayName
 * @returns
 */
const isExistingUser = async (companyId, lineUserId, lineDisplayName) => {
    const dynamoDbQueryParams = {
        "TableName": 'users',
        "KeyConditionExpression": "#pk_name = :pk_prm and #sk_name = :sk_prm",
        "ExpressionAttributeNames": {
            "#pk_name": "company_id",
            "#sk_name": "line_user_id",
        },
        "ExpressionAttributeValues": {
            ":pk_prm": { S: companyId },
            ":sk_prm": { S: lineUserId },
        }
    }

    let user
    try {
        user = await dynamo.query(dynamoDbQueryParams).promise();
        if (user.Count === 0) {
            const dynamoDbPutParams = {
                "TableName": 'users',
                "Item": {
                    "company_id": { S: companyId },
                    "line_user_id": { S: lineUserId },
                    "line_display_name": { S: lineDisplayName },
                    "employee_key": { NULL: true },
                    "employee_code": { NULL: true },
                    "employee_name": { NULL: true },
                    "work_start": { NULL: true },
                    "work_end": { NULL: true },
                    "stamping_count": { S: "0" },
                }
            };
            console.log(dynamoDbPutParams)
            await dynamo.putItem(dynamoDbPutParams).promise();
            console.log(`Created user: ${JSON.stringify(dynamoDbPutParams)}`)
            return false;
        };
        return true;
    } catch (e) {
        // TODO: Find better implementation
        console.log(e);
        return "Error"
    }

}

const isStamping = (str) => {
    return /^打刻$/.test(str);
}

const handleStamping = (lineUserId, kotAccessToken) => {

}

/**
 * Check if work time
 *
 * @param str message from line
 * @returns work times or false
 */
const isWorkTimeSubmit = (str) => {
    if (!/^\d\d\/\d\d$/.test(str)) return false;
    const times = str.split('/');
    const timeList = [
        '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
        '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24']
    if (!timeList.includes(times[0])) return false;
    if (!timeList.includes(times[1])) return false;
    if (times[0] === times[1]) return false;
    return times;
}

/**
 * Put work time in table
 *
 * @param workTimes
 * @param companyId
 * @param lineUserId
 * @param lineDisplayName
 */
const handleWorkTime = async (workTimes, companyId, lineUserId ,lineDisplayName) => {
    const dynamoDbUpdateItemParams = {
        "TableName": 'users',
        "Key": {
            "company_id": { S: companyId },
            "line_user_id": { S: lineUserId },
        },
        "UpdateExpression": `
            set #stampingCount = :stampingCountValue,
                #workStart = :workStartValue,
                #workEnd = :workEndValue,
                #lineDisplayName = :lineDisplayNameValue
            `,
        "ExpressionAttributeNames": {
            '#stampingCount': 'stamping_count',
            '#workStart': 'work_start',
            '#workEnd': 'work_end',
            '#lineDisplayName': 'line_display_name',
        },
        "ExpressionAttributeValues": {
            ':stampingCountValue'  : { S: '0' },
            ':workStartValue'      : { S: workTimes[0] },
            ':workEndValue'        : { S: workTimes[1] },
            ':lineDisplayNameValue': { S: lineDisplayName },
        },
    };
    try {
        await dynamo.updateItem(dynamoDbUpdateItemParams).promise();
        console.log(`Updated work time ${dynamoDbUpdateItemParams}`);
        return true;
    } catch (e) {
        console.log(e);
        return "Error";
    }
}
