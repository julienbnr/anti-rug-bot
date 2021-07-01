const { Webhook } = require('discord-webhook-node');
const hook = new Webhook("https://discord.com/api/webhooks/857381997608697926/V161yxka_Tc1htOAKDIpkx5Vk8woe_721e1gKs686hVXXGBy14fBBDEBxx2uj5pe9zrS");

const sendWebhook = async (msg) => {
  hook.send(msg);
};

exports.sendWebhook = sendWebhook;

