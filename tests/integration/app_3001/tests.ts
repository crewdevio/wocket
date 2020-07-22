import { Server } from "../../../mod.ts";
import { Drash } from "../../deps.ts";
import { assert, assertEquals, connectWebSocket } from "../../deps.ts";

let storage: any = {
  "chan1": {
    messages: [],
  },
  "chan2": {
    messages: [],
  },
};

class Resource extends Drash.Http.Resource {
  static paths = ["/"];
  protected messages: any = {};
  public async POST() {
    const channel = this.request.getBodyParam("channel");
    const message = this.request.getBodyParam("message");
    const socketClient = await connectWebSocket(
      `wss://${server.hostname}:${server.port}`,
    );
    let encoded = new TextEncoder().encode(
      JSON.stringify({ [channel as string]: message }),
    );
    await socketClient.send(encoded);
    socketClient.close();
    return this.response;
  }
}

const webServer = new Drash.Http.Server({
  resources: [
    Resource,
  ],
});

webServer.run({
  hostname: "localhost",
  port: 3001,
});
console.log(`Web server started on ${webServer.hostname}:${webServer.port}`);

const server = new Server();
server.runTLS({
  hostname: "localhost",
  port: 3000,
  certFile: "./tests/integration/app_3001/server.crt",
  keyFile: "./tests/integration/app_3001/server.key",
});
console.log(
  `server listening: http://${server.hostname}:${server.port}`,
);
console.log(
  "\nIntegration tests: testing channel creation and deletion on wss.\n",
);

// Set up the events

server
  .createChannel("chan1")
  .on(
    "chan1",
    ((packet: any) => {
      storage["chan1"].messages.push(packet.message);
    }),
  );

Deno.test("chan1 should exist", () => {
  assertEquals("chan1", server.getChannel("chan1").name);
});

Deno.test("chan2 should exist again", () => {
  server
    .createChannel("chan2")
    .on(
      "chan2",
      ((packet: any) => {
        storage["chan2"].messages.push(packet.message);
      }),
    );
  assertEquals("chan2", server.getChannel("chan2").name);
});

Deno.test("chan1 should have 1 message", async () => {
  await sendMessage("chan1", "This is a chan1 message.");
  assertEquals(
    storage["chan1"].messages,
    [
      "This is a chan1 message.",
    ],
  );
});

Deno.test("chan1 should have 2 messages", async () => {
  await sendMessage("chan1", "This is a chan1 message #2.");
  assertEquals(
    storage["chan1"].messages,
    [
      "This is a chan1 message.",
      "This is a chan1 message #2.",
    ],
  );
});

Deno.test("chan2 should have 1 message", async () => {
  await sendMessage("chan2", "This is a chan2 message.");
  assertEquals(
    storage["chan2"].messages,
    [
      "This is a chan2 message.",
    ],
  );
});

Deno.test("chan2 should be closed", () => {
  server.closeChannel("chan2");
  assertEquals(undefined, server.getChannel("chan2"));
});

Deno.test("chan2 should not receive this message", async () => {
  server.createChannel("chan2");
  await sendMessage("chan2", "Test");
  assertEquals(
    storage["chan2"].messages,
    [
      "This is a chan2 message.",
    ],
  );
});

Deno.test({
  name: "Stop the server",
  async fn() {
    await webServer.close();
    await server.close();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

async function sendMessage(channel: string, message: string) {
  const response = await fetch("http://localhost:3001", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      message,
    }),
  });
  await response.text();
}
