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

    // Check if the user exists
    const user = await getUser(companyId, lineUserId, lineDisplayName);
    if (user === "SignedUp") {
        return "ユーザー登録が完了しました。"
    } else if (user === "Error") {
        return "エラーが発生しました。"
    }

    const message = requestFromLine.events[0].message.text;

    // Handle stamping
    console.log(message);
    if (isStamping(message)) {
        console.log("in text");
        return handleStamping(user, lineDisplayName, kotAccessToken);
    }

    // Handle Stamping
    const startTime = isStart(message);
    if (startTime) {
        return handleStartOrEnd(user, 1, startTime, kotAccessToken);
    }

    const endTime = isEnd(message);
    if (endTime) {
        return handleStartOrEnd(user, 2, endTime, kotAccessToken);
    }

    // Handle work time message
    const workTimes = isWorkTimeSubmit(message);
    if (workTimes) {
        const resWorkTime = await handleWorkTime(workTimes, companyId, lineUserId, lineDisplayName);
        if (resWorkTime === "Error") {
            return "エラーが発生しました。";
        }
        return "時刻を更新しました。";
    }

    if (isDeleting(message)) {
        const res = await handleDelete(user, lineDisplayName)
        if (res === "Error") return "エラーが発生しました。"
        return "出勤/退勤時間を削除しました。"
    }

    // デフォルトメッセージ
    const [workStart, workEnd] = [user.Items[0].work_start.S, user.Items[0].work_end.S]
    if (workStart && workEnd) {
        return `開始時間: ${workStart}時、終了時間: ${workEnd}時で設定されています。\nコマンド\n「打刻」: 自動打刻を行う`
    }
    return "勤務開始、終了時刻は設定されていません。\nコマンド\n「打刻」: 自動打刻を行う"
}

/**
 * Check if the user exists. If not, register.
 *
 * @param  companyId
 * @param  lineUserId
 * @param  lineDisplayName
 * @returns
 */
const getUser = async (companyId, lineUserId, lineDisplayName) => {
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

    let userData
    try {
        userData = await dynamo.query(dynamoDbQueryParams).promise();
        if (userData.Count === 0) {
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
            return "SignedUp";
        };
        return userData;
    } catch (e) {
        // TODO: Find better implementation
        console.log(e);
        return "Error"
    }

}

/**
 * Check if stamping
 *
 * @param str
 * @returns str is boolean
 */
const isStamping = (str) => {
    return /^打刻$/.test(str);
}

/**
 * Handle stamping
 *
 * @param  user
 * @param  lineDisplayName
 * @param  kotAccessToken
 * @returns
 */
const handleStamping = async (user, lineDisplayName, kotAccessToken) => {
    const kotHeader = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${kotAccessToken}`,
    }

    const date = new Date(Date.now() + ((new Date().getTimezoneOffset() + (9 * 60)) * 60 * 1000));
    const kotBody = {
        date: `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        time: `${date.toISOString().slice(0, 19)}+09:00`
    }

    let responseFromKot
    try {
        responseFromKot = await axios.post(
            `https://api.kingtime.jp/v1.0/daily-workings/timerecord/${user.Items[0].employee_key.S}`,
            kotBody,
            {headers: kotHeader},
        )
        console.log(responseFromKot);
    } catch (e) {
        console.log(e);
        return "打刻に失敗しました。";
    }

    try {
        const dynamoDbUpdateItemParams = {
            "TableName": 'users',
            "Key": {
                "company_id"  : { S: user.Items[0].company_id.S },
                "line_user_id": { S: user.Items[0].line_user_id.S },
            },
            "UpdateExpression": `
                set
                #item1 = :val1,
                #item2 = :val2
                `,
            "ExpressionAttributeNames": {
                '#item1': 'stamping_count',
                '#item2': 'line_display_name'
            },
            "ExpressionAttributeValues": {
                ':val1': { S: String(Number(user.Items[0].stamping_count.S ) + 1) },
                ':val2': { S: user.Items[0].line_display_name.S }
            },
        };
        await dynamo.updateItem(dynamoDbUpdateItemParams).promise();
        return "打刻に成功しました。"
    } catch (e) {
        console.log(e);
        return "打刻には成功しましたが、打刻回数の登録に失敗しました。"
    }

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
        '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']
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

/**
 * Check if deleting
 *
 * @param str
 * @returns boolean
 */
const isDeleting = (str) => {
    return /^削除$/.test(str);
}

const handleDelete = async (user, lineDisplayName) => {
    const dynamoDbUpdateItemParams = {
        "TableName": 'users',
        "Key": {
            "company_id": { S: user.Items[0].company_id.S },
            "line_user_id": { S: user.Items[0].line_user_id.S },
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
            ':workStartValue'      : { NULL: true },
            ':workEndValue'        : { NULL: true },
            ':lineDisplayNameValue': { S: lineDisplayName },
        },
    }
    try {
        await dynamo.updateItem(dynamoDbUpdateItemParams).promise();
        console.log(`Deleted work time ${dynamoDbUpdateItemParams}`);
        return true;
    } catch (e) {
        console.log(e);
        return "Error";
    }
}

const isStart = (str) => {
    if (!/^出勤\d\d$/.test(str)) return false;
    const start = str.slice(2);
    const timeList = [
        '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
        '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']
    if (!timeList.includes(start)) return false;
    return start;
}

const isEnd = (str) => {
    if (!/^退勤\d\d$/.test(str)) return false;
    const end = str.slice(2);
    const timeList = [
        '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
        '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23']
    if (!timeList.includes(end)) return false;
    return end;
}

const handleStartOrEnd = async (user, type, time, kotAccessToken) => {
    const kotHeader = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${kotAccessToken}`,
    }

    const date = new Date(Date.now() + ((new Date().getTimezoneOffset() + (9 * 60)) * 60 * 1000));
    date.setHours(Number(time), 0);
    const kotBody = {
        date: `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
        time: `${date.toISOString().slice(0, 19)}+09:00`,
        code: String(type),
    }

    let responseFromKot
    try {
        responseFromKot = await axios.post(
            `https://api.kingtime.jp/v1.0/daily-workings/timerecord/${user.Items[0].employee_key.S}`,
            kotBody,
            {headers: kotHeader},
        )
        console.log(responseFromKot);
    } catch (e) {
        console.log(e);
        return "打刻に失敗しました。";
    }

    try {
        const dynamoDbUpdateItemParams = {
            "TableName": 'users',
            "Key": {
                "company_id"  : { S: user.Items[0].company_id.S },
                "line_user_id": { S: user.Items[0].line_user_id.S },
            },
            "UpdateExpression": `
                set
                #item1 = :val1,
                #item2 = :val2
                `,
            "ExpressionAttributeNames": {
                '#item1': 'stamping_count',
                '#item2': 'line_display_name'
            },
            "ExpressionAttributeValues": {
                ':val1': { S: String(Number(user.Items[0].stamping_count.S ) + 1) },
                ':val2': { S: user.Items[0].line_display_name.S }
            },
        };
        await dynamo.updateItem(dynamoDbUpdateItemParams).promise();
        return "打刻に成功しました。"
    } catch (e) {
        console.log(e);
        return "打刻には成功しましたが、打刻回数の登録に失敗しました。"
    }
}
