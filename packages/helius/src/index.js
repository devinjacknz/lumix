"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeliusClient = void 0;
exports.createHeliusClient = createHeliusClient;
const client_1 = require("./client");
Object.defineProperty(exports, "HeliusClient", { enumerable: true, get: function () { return client_1.HeliusClient; } });
function createHeliusClient(config) {
    return new client_1.HeliusClient(config);
}
//# sourceMappingURL=index.js.map