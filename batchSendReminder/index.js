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

    console.log(`Current time is ${hour}:${minutes}.`);

    users.Items.map(async (user) => {
        const [workStart, workEnd] = [user.work_start.S, user.work_start.S];
        const stampingCount = user.stamping_count.S;

        const expWorkStart
            = workStart == (hour - 1) && minutes >= 50 && minutes <= 59 && stampingCount == 0;
        const expWorkEnd
            = workEnd   == hour       && minutes >= 0  && minutes <= 9  && (stampingCount == 0 || stampingCount == 1);

        // Send Reminder
        if (expWorkStart || expWorkEnd) {
            const pushMessage = {
                to: user.line_user_id.S,
                messages:[
                    {
                        "type":"text",
                        "text":"打刻を行ってください。",
                        "quickReply": {
                            "items": [
                                {
                                "type": "action",
                                "action": {
                                    "type":"message",
                                    "label":"打刻を行う",
                                    "text": "打刻"
                                    }
                                },
                            ]
                        }
                    }
                ]
            }

            const lineAccessToken = findAccessToken(companies, user.company_id.S);
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
        }
    })
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
    if(res.data === 'holiday') return true;
    return false;
}
