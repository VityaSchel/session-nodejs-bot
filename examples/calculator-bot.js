"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
async function main() {
    await (0, src_1.initializeSession)();
    console.log('Initialized!');
    const events = new src_1.EventEmitter();
    events.on('message', (message, conversation) => {
        if (message.dataMessage) {
            const text = message.dataMessage.body;
            const regex = /^(\d+) ?(\+|\-|\/|\*) ?(\d+)$/;
            console.log('========================================', text, regex.test(text));
            if (text && regex.test(text)) {
                const [, firstNumber, operand, secondNumber] = text.match(regex);
                const leftN = Number(firstNumber);
                const rightN = Number(secondNumber);
                console.log('========================================', leftN, rightN, Number.isSafeInteger(leftN) && Number.isSafeInteger(rightN), JSON.stringify(operand));
                if (Number.isSafeInteger(leftN) && Number.isSafeInteger(rightN)) {
                    let result;
                    switch (operand) {
                        case '+':
                            result = leftN + rightN;
                            break;
                        case '-':
                            result = leftN - rightN;
                            break;
                        case '*':
                            result = leftN * rightN;
                            break;
                        case '/':
                            result = leftN / rightN;
                            break;
                        default:
                            break;
                    }
                    console.log('Sending', conversation.id, result);
                    (0, src_1.sendMessage)(conversation.id, {
                        body: String(result),
                        attachments: undefined,
                        quote: undefined,
                        preview: undefined,
                        groupInvitation: undefined
                    });
                }
            }
        }
    });
}
main();
