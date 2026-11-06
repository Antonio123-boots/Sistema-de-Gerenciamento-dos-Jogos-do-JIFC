const ngrok = require("@ngrok/ngrok");

async function forwardToApp() {
  const port = process.env.PORT || 3000;
  const forwarder = await ngrok.forward({
    addr: `localhost:${port}`,
    authtoken_from_env: true,
    domain: "depth-wreath-ladylike.ngrok-free.dev",
  });
  console.log(`Available at: ${forwarder.url()}`);
}

forwardToApp();