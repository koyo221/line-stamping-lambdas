// This Lambda function is Git controlled.
const axios = require('axios');
const aws = require('aws-sdk');
const dynamo = new aws.DynamoDB();

exports.handler = async (event) => {

    if (await isHoliday()) {
        return;
    }

    const dynamoDbScanUsersParam = {
        "TableName": 'users',
    }
    const dynamoDbScanCompaniesParam = {
        "TableName": 'companies',
    }
    const users = await dynamo.scan(dynamoDbScanUsersParam).promise();
    const companies = await dynamo.scan(dynamoDbScanCompaniesParam).promise();

    // Convert UTC to JST
    const date = new Date(Date.now() + ((new Date().getTimezoneOffset() + (9 * 60)) * 60 * 1000));
    const [hour, minutes] = [date.getHours(), date.getMinutes()];

    console.log(`Current time is ${hour}:${minutes}`);

    // Always use for...of for await call (not map or other callbacks)
    for (const user of users.Items) {
        const [workStart, workEnd] = [Number(user.work_start.S), Number(user.work_end.S)];
        const stampingCount = Number(user.stamping_count.S);

        const expWorkStart
            = workStart - 1 == hour && minutes >= 50 && minutes <= 59 && stampingCount == 0;
        const expWorkEnd
            = workEnd == hour && minutes >= 10 && minutes <= 19 && (stampingCount == 0 || stampingCount == 1);

        const doRemind = expWorkStart || expWorkEnd;

        // Send Reminder
        if (doRemind) {
            console.log('remind start')
            const pushMessage = {
                to: user.line_user_id.S,
                messages: [
                    {
                        "type": "text",
                        "text": "打刻を行ってください。",
                        "quickReply": {
                            "items": [
                                {
                                    "type": "action",
                                    "action": {
                                        "type": "message",
                                        "label": "打刻を行う",
                                        "text": "打刻"
                                    }
                                },
                            ]
                        }
                    }
                ]
            }

            const lineAccessToken = findAccessToken(companies, user.company_id.S);
            try {
                const res = await axios.post(
                    "https://api.line.me/v2/bot/message/push",
                    pushMessage,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${lineAccessToken}`
                        }
                    }
                )
                console.log(res);
            } catch (e) {
                console.log(e);
            }
        }

        const expWorkStartNoStamping
            = workStart == hour && minutes >= 30 && minutes <= 39 && stampingCount == 0;
        const expWorkEndNoStamping
            = workEnd == hour && minutes >= 30 && minutes <= 39 && (stampingCount == 0 || stampingCount == 1);
        const doRemindNoStamping = expWorkStartNoStamping || expWorkEndNoStamping;

        if (doRemindNoStamping) {
            let text
            if (expWorkStartNoStamping) {
                text = `出勤${user.work_start.S}`
            };
            if (expWorkEndNoStamping) {
                text = `退勤${user.work_end.S}`
            };
            if (!text) return;

            const pushMessageNoStamping = {
                to: user.line_user_id.S,
                messages: [
                    {
                        "type": "text",
                        "text": "修正打刻を行いますか？",
                        "quickReply": {
                            "items": [
                                {
                                    "type": "action",
                                    "action": {
                                        "type": "message",
                                        "label": text,
                                        "text": text
                                    }
                                },
                            ]
                        }
                    }
                ]
            }

            const lineAccessToken = findAccessToken(companies, user.company_id.S);
            try {
                const res = await axios.post(
                    "https://api.line.me/v2/bot/message/push",
                    pushMessageNoStamping,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${lineAccessToken}`
                        }
                    }
                )
                console.log(res);
            } catch (e) {
                console.log(e);
            }
        }
    }
};

/**
 * Find access token via companies table
 *
 * @param companies
 * @param companyId
 */
const findAccessToken = (companies, companyId) => {
    for (const company of companies.Items) {
        if (company.id.S === companyId) {
            return company.line_token.S;
        }
    }
}

/**
 * Check if today is holiday
 * https://s-proj.com/utils/holiday.html
 *
 * @returns
 */
const isHoliday = async () => {
    const res = await axios.get('https://s-proj.com/utils/checkHoliday.php');
    if (res.data === 'holiday') return true;
    return false;
}
