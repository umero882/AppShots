/**
 * Minimal SMTP client built on Node's `net`/`tls` — no nodemailer, matching the
 * zero-dependency backend. Enough of RFC 5321 to send one message through an
 * authenticated relay (Hostinger, Gmail, Postmark SMTP, …): implicit TLS (465) or
 * STARTTLS (587), AUTH PLAIN/LOGIN, MAIL/RCPT/DATA/QUIT, multi-line replies.
 */
import net from "net";
import tls from "tls";

const CRLF = "\r\n";

/* ------------------------------- message ------------------------------- */
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const wrap76 = (s) => s.replace(/(.{76})/g, "$1" + CRLF);
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

/** "Name <addr>" | "addr" → { name, addr } */
export function parseAddress(input) {
  const m = String(input || "").trim().match(/^(?:"?([^"<]*)"?\s*)?<([^>]+)>$/);
  if (m) return { name: (m[1] || "").trim(), addr: m[2].trim() };
  return { name: "", addr: String(input || "").trim() };
}
const formatAddress = ({ name, addr }) => (name ? `${encodeHeader(name)} <${addr}>` : addr);

/** Build an RFC 5322 message (multipart/alternative when both text and html). */
export function buildMessage({ from, to, subject, text = "", html = "", replyTo, messageId, date = new Date() }) {
  const fromA = parseAddress(from);
  const toA = parseAddress(to);
  const boundary = "=_appshots_" + Math.random().toString(36).slice(2);
  const id = messageId || `<${Date.now()}.${Math.random().toString(36).slice(2)}@${fromA.addr.split("@")[1] || "localhost"}>`;
  const headers = [
    `From: ${formatAddress(fromA)}`,
    `To: ${formatAddress(toA)}`,
    `Subject: ${encodeHeader(subject || "")}`,
    `Date: ${date.toUTCString()}`,
    `Message-ID: ${id}`,
    "MIME-Version: 1.0",
  ];
  if (replyTo) headers.push(`Reply-To: ${formatAddress(parseAddress(replyTo))}`);
  headers.push("X-Mailer: AppShots");

  const part = (type, body) =>
    [`Content-Type: ${type}; charset=UTF-8`, "Content-Transfer-Encoding: base64", "", wrap76(b64(body))].join(CRLF);

  let body;
  if (text && html) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    body = [
      `--${boundary}`,
      part("text/plain", text),
      `--${boundary}`,
      part("text/html", html),
      `--${boundary}--`,
      "",
    ].join(CRLF);
  } else {
    body = part(html ? "text/html" : "text/plain", html || text);
  }
  return headers.join(CRLF) + CRLF + CRLF + body;
}

/* ------------------------------- transport ------------------------------ */
class SmtpError extends Error {
  constructor(step, code, reply) {
    super(`smtp-${step}-failed: ${code} ${reply}`.trim());
    this.step = step;
    this.code = code;
  }
}

/** Speaks SMTP over an existing socket; one command in flight at a time. */
class Session {
  constructor(socket, timeoutMs) {
    this.socket = socket;
    this.buf = "";
    this.waiters = [];
    this.timeoutMs = timeoutMs;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      this.buf += chunk;
      this.flush();
    });
    socket.on("error", (e) => this.fail(e));
    socket.on("close", () => this.fail(new Error("smtp-connection-closed")));
  }
  attach(socket) {
    // After STARTTLS the plaintext socket is wrapped; listen on the new one.
    this.socket.removeAllListeners("data");
    this.socket.removeAllListeners("error");
    this.socket.removeAllListeners("close");
    this.socket = socket;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      this.buf += chunk;
      this.flush();
    });
    socket.on("error", (e) => this.fail(e));
    socket.on("close", () => this.fail(new Error("smtp-connection-closed")));
  }
  fail(err) {
    const w = this.waiters.splice(0);
    for (const { reject, timer } of w) {
      clearTimeout(timer);
      reject(err);
    }
  }
  /** Resolve the oldest waiter once a complete (possibly multi-line) reply is in. */
  flush() {
    while (this.waiters.length) {
      const m = this.buf.match(/^(\d{3})([ -])(.*)\r?\n/);
      if (!m) return;
      // Multi-line: "250-..." lines continue until "250 ...".
      const lines = [];
      let rest = this.buf;
      let done = false;
      while (true) {
        const l = rest.match(/^(\d{3})([ -])(.*)\r?\n/);
        if (!l) break;
        lines.push(l[3]);
        rest = rest.slice(l[0].length);
        if (l[2] === " ") {
          done = true;
          break;
        }
      }
      if (!done) return; // wait for more data
      this.buf = rest;
      const { resolve, timer } = this.waiters.shift();
      clearTimeout(timer);
      resolve({ code: Number(m[1]), lines });
    }
  }
  read() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const i = this.waiters.findIndex((w) => w.timer === timer);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error("smtp-timeout"));
      }, this.timeoutMs);
      this.waiters.push({ resolve, reject, timer });
      this.flush();
    });
  }
  async cmd(line, step, okCodes) {
    if (line !== null) this.socket.write(line + CRLF);
    const reply = await this.read();
    if (!okCodes.includes(reply.code)) throw new SmtpError(step, reply.code, reply.lines.join(" "));
    return reply;
  }
}

function connect({ host, port, secure, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const onErr = (e) => reject(e);
    const socket = secure
      ? tls.connect({ host, port, servername: host }, () => resolve(socket))
      : net.connect({ host, port }, () => resolve(socket));
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error("smtp-connect-timeout")));
    socket.once("error", onErr);
  });
}

/**
 * Send one message. `secure: true` = implicit TLS (port 465). On plain ports the
 * client upgrades with STARTTLS when the server offers it (set `requireTls:
 * false` only for local test servers).
 */
export async function sendMail({
  host,
  port = 465,
  secure = port === 465,
  user,
  pass,
  from,
  to,
  subject,
  text,
  html,
  replyTo,
  timeoutMs = 20000,
  requireTls = true,
  ehloName = "appshots",
}) {
  if (!host || !from || !to) throw new Error("smtp-missing-params");
  const socket = await connect({ host, port, secure, timeoutMs });
  const s = new Session(socket, timeoutMs);
  try {
    await s.cmd(null, "greeting", [220]);
    let ehlo = await s.cmd(`EHLO ${ehloName}`, "ehlo", [250]);
    const offers = (name) => ehlo.lines.some((l) => l.toUpperCase().startsWith(name));

    if (!secure) {
      if (offers("STARTTLS")) {
        await s.cmd("STARTTLS", "starttls", [220]);
        const upgraded = await new Promise((resolve, reject) => {
          const t = tls.connect({ socket, servername: host }, () => resolve(t));
          t.once("error", reject);
        });
        s.attach(upgraded);
        ehlo = await s.cmd(`EHLO ${ehloName}`, "ehlo", [250]);
      } else if (requireTls) {
        throw new Error("smtp-tls-unavailable");
      }
    }

    if (user && pass) {
      const authLine = ehlo.lines.find((l) => l.toUpperCase().startsWith("AUTH")) || "";
      if (/PLAIN/i.test(authLine) || !/LOGIN/i.test(authLine)) {
        await s.cmd(`AUTH PLAIN ${b64(`\0${user}\0${pass}`)}`, "auth", [235]);
      } else {
        await s.cmd("AUTH LOGIN", "auth", [334]);
        await s.cmd(b64(user), "auth", [334]);
        await s.cmd(b64(pass), "auth", [235]);
      }
    }

    const fromAddr = parseAddress(from).addr;
    const toAddr = parseAddress(to).addr;
    await s.cmd(`MAIL FROM:<${fromAddr}>`, "mail-from", [250]);
    await s.cmd(`RCPT TO:<${toAddr}>`, "rcpt-to", [250, 251]);
    await s.cmd("DATA", "data", [354]);
    const message = buildMessage({ from, to, subject, text, html, replyTo });
    // Dot-stuffing: a line starting with "." would end the DATA section.
    const stuffed = message.replace(/\r?\n\./g, CRLF + "..");
    const done = await s.cmd(stuffed + CRLF + ".", "data-end", [250]);
    try {
      await s.cmd("QUIT", "quit", [221]);
    } catch {
      /* server may just close — the message is already accepted */
    }
    return { accepted: toAddr, reply: done.lines.join(" ") };
  } finally {
    socket.destroy();
  }
}
