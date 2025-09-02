# 🔑 Cloudflare KV Usage Guide (USERS Namespace)

This document explains how to use **Cloudflare KV** with Wrangler to manage student accounts (username + password) in the `USERS` namespace.

---

## 📦 1. List All KV Namespaces

Check available namespaces:

```sh
wrangler kv namespace list
```


✅ Make sure the namespace `USERS` exists.

```sh
wrangler kv key list --binding=USERS
```

Example output:

```json
[
  { "name": "user:student1" },
  { "name": "user:student2" },
  { "name": "user:student3" }
]
```

---

## 🔎 4. Check a Student Password

Get the stored value (password) for one user:

```sh
wrangler kv key get user:student1 --binding=USERS
```

Output:

```json
{"password":"1234"}
```

---

## 🗑️ 5. Delete a Student User

Remove a student account completely:

```sh
wrangler kv key delete user:student1 --binding=USERS
```

---

## 🔄 6. Update a Student Password

To change a student’s password, delete the old one and add a new entry:

```sh
wrangler kv key delete user:student1 --binding=USERS
wrangler kv key put user:student1 '{"password":"newpass"}' --binding=USERS
```

---

## 📌 Notes

* Keys are prefixed with `user:` to keep them organized.
* Values are stored as JSON so you can expand later (e.g., `{ "password": "1234", "role": "admin" }`).
* **Never share student passwords publicly.**

---

Kiing, this is a classic case of Wrangler CLI version drift versus documentation expectations. You're using **Wrangler v4.33.1**, but the command structure you're trying (`kv:namespace list`) is from **Wrangler v3.x**. In v4, Cloudflare **removed direct KV CLI access** — all KV operations now happen through **API calls or via your Worker code**, not the CLI.

---

### 🧨 What Changed in Wrangler v4

- ✅ `wrangler.toml` still defines KV bindings for your Worker.
- ❌ You **can’t list, get, or put KV keys** via CLI anymore.
- ✅ You **must interact with KV inside your Worker code** or use the [Cloudflare dashboard](https://dash.cloudflare.com/) or [KV REST API](https://developers.cloudflare.com/api/operations/kv-namespace-read-key-value).

---

### 🛠️ How to Read a KV Value Now

You’ve got two solid options:

#### 1. **Use Worker Code (via `fetch`)**
Inside your Worker, access KV like this:

```js
export default {
  async fetch(request, env) {
    const value = await env.USERS.get("user:student1");
    return new Response(value || "Not found");
  }
}
```

Then deploy and hit the endpoint to read the value.

#### 2. **Use the Cloudflare Dashboard**
- Go to [dash.cloudflare.com](https://dash.cloudflare.com/)
- Navigate to your Worker → KV → `USERS` namespace
- Use the UI to view/edit keys



Exactly 👍 — you’ve got it right.

* In **`script-login.js`**, the line

```js
window.location.href = "/dashboard.html";
```

is what performs the redirect after a successful login. ✅

So:

* The **Worker** (`worker.js`) only needs to check cookies/sessions when someone requests `/` or `/dashboard.html`.
* The **frontend** (`script-login.js`) is the one that actually redirects the browser to `/dashboard.html` after login.

That’s why your login flow works like this:

1. User goes to `https://plc-web.online/` → Worker checks for session cookie.

   * If **not logged in**, Worker redirects to `/login.html`.
   * If **logged in**, Worker serves `/dashboard.html`.

2. On `/login.html`, when they submit the form, `script-login.js` → calls `/api/login`.

   * If login fails → shows error text.
   * If login succeeds → browser is redirected to `/dashboard.html`.


