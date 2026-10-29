import { get } from "node:http";

const request = get({
  hostname: "127.0.0.1",
  port: process.env.PORT ?? "3000",
  path: "/api/health",
  headers: { Connection: "close" },
}, (response) => {
  response.resume();
  response.on("end", () => { process.exitCode = response.statusCode === 200 ? 0 : 1; });
  response.on("error", () => { process.exitCode = 1; });
});
request.setTimeout(4000, () => request.destroy(new Error("Healthcheck expirado.")));
request.on("error", () => { process.exitCode = 1; });
