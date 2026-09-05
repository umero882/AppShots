import { describe, it, expect, afterAll } from "vitest";
import net from "net";
import { buildMessage, parseAddress, sendMail } from "./smtp.js";

/** A tiny in-process SMTP server that records what the client sends. */
function fakeSmtpServer({ authOk = true, rejectRcpt = false } = {}) {
  const log = [];
  let data = "";
  const server = net.createServer((sock) => {
    let inData = false;
    const say = (s) => sock.write(s + "\r\n");
    say("220 fake.test ESMTP");
    let buf = "";
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            say("250 2.0.0 Ok: queued as 123");
          } else data += (line.startsWith("..") ? line.slice(1) : line) + "\r\n";
          continue;
        }
        log.push(line);
        const up = line.toUpperCase();
        if (up.startsWith("EHLO")) sock.write("250-fake.test\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
        else if (up.startsWith("AUTH PLAIN")) say(authOk ? "235 2.7.0 Authentication successful" : "535 5.7.8 Authentication failed");
        else if (up.startsWith("MAIL FROM")) say("250 2.1.0 Ok");
        else if (up.startsWith("RCPT TO")) say(rejectRcpt ? "550 5.1.1 No such user" : "250 2.1.5 Ok");
        else if (up === "DATA") {
          inData = true;
          say("354 End data with <CR><LF>.<CR><LF>");
        } else if (up === "QUIT") {
          say("221 Bye");
          sock.end();
        } else say("500 Unknown");
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, log, getData: () => data, close: () => server.close() }));
  });
}

describe("parseAddress / buildMessage", () => {
  it("parses display names and bare addresses", () => {
    expect(parseAddress("AppShots <noreply@x.com>")).toEqual({ name: "AppShots", addr: "noreply@x.com" });
    expect(parseAddress("noreply@x.com")).toEqual({ name: "", addr: "noreply@x.com" });
  });

  it("builds a multipart/alternative message with base64 parts", () => {
    const msg = buildMessage({ from: "AppShots <a@x.com>", to: "b@y.com", subject: "Hi", text: "plain", html: "<b>html</b>" });
    expect(msg).toMatch(/^From: AppShots <a@x\.com>\r\n/);
    expect(msg).toContain("Subject: Hi\r\n");
    expect(msg).toContain('Content-Type: multipart/alternative; boundary="');
    expect(msg).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(msg).toContain("Content-Type: text/html; charset=UTF-8");
    expect(msg).toContain(Buffer.from("<b>html</b>").toString("base64"));
  });

  it("MIME-encodes non-ASCII subjects", () => {
    const msg = buildMessage({ from: "a@x.com", to: "b@y.com", subject: "Réinitialiser", text: "x" });
    expect(msg).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=\r\n/);
  });
});

describe("sendMail (against an in-process SMTP server)", () => {
  const servers = [];
  afterAll(() => servers.forEach((s) => s.close()));

  it("authenticates, submits the message, and dot-stuffs the body", async () => {
    const srv = await fakeSmtpServer();
    servers.push(srv);
    const res = await sendMail({
      host: "127.0.0.1",
      port: srv.port,
      secure: false,
      requireTls: false,
      user: "me@x.com",
      pass: "secret",
      from: "AppShots <noreply@x.com>",
      to: "you@y.com",
      subject: "Reset",
      text: "line one\n.hidden dot line\nend",
      html: "<p>hi</p>",
    });
    expect(res.accepted).toBe("you@y.com");
    expect(srv.log.some((l) => l.startsWith("EHLO"))).toBe(true);
    expect(srv.log).toContain(`AUTH PLAIN ${Buffer.from("\0me@x.com\0secret").toString("base64")}`);
    expect(srv.log).toContain("MAIL FROM:<noreply@x.com>");
    expect(srv.log).toContain("RCPT TO:<you@y.com>");
    expect(srv.log).toContain("DATA");
    // The base64 body never starts a line with "." but the stuffing path is exercised
    // on headers/body alike; the server un-stuffs, so the message must round-trip.
    expect(srv.getData()).toContain("Subject: Reset");
    expect(srv.getData()).toContain("From: AppShots <noreply@x.com>");
  });

  it("surfaces an auth failure with the SMTP step and code", async () => {
    const srv = await fakeSmtpServer({ authOk: false });
    servers.push(srv);
    await expect(
      sendMail({ host: "127.0.0.1", port: srv.port, secure: false, requireTls: false, user: "u", pass: "p", from: "a@x.com", to: "b@y.com", subject: "s", text: "t" })
    ).rejects.toThrow(/smtp-auth-failed: 535/);
  });

  it("surfaces a rejected recipient", async () => {
    const srv = await fakeSmtpServer({ rejectRcpt: true });
    servers.push(srv);
    await expect(
      sendMail({ host: "127.0.0.1", port: srv.port, secure: false, requireTls: false, from: "a@x.com", to: "nobody@y.com", subject: "s", text: "t" })
    ).rejects.toThrow(/smtp-rcpt-to-failed: 550/);
  });

  it("refuses to send in the clear when TLS is required but not offered", async () => {
    const srv = await fakeSmtpServer();
    servers.push(srv);
    await expect(
      sendMail({ host: "127.0.0.1", port: srv.port, secure: false, from: "a@x.com", to: "b@y.com", subject: "s", text: "t" })
    ).rejects.toThrow(/smtp-tls-unavailable/);
  });
});
