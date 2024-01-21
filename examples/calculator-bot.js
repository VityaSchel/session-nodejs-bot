"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const src_1 = require("../src");
async function main() {
    await (0, src_1.initializeSession)();
    const events = new src_1.EventEmitter();
    events.on('message', (message, conversation) => {
        if (message.dataMessage) {
            const text = message.dataMessage.body;
            const regex = /^(\d+) ?(\+|\-|\/|\*) ?(\d+)$/;
            if (text && regex.test(text)) {
                const [, firstNumber, operand, secondNumber] = text.match(regex);
                const leftN = Number(firstNumber);
                const rightN = Number(secondNumber);
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
