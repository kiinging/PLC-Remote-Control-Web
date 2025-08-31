# 🔑 Cloudflare KV Usage Guide (USERS Namespace)

This document explains how to use **Cloudflare KV** with Wrangler to manage student accounts (username + password) in the `USERS` namespace.

---

## 📦 1. List All KV Namespaces

Check available namespaces:

```sh
wrangler kv namespace list
```

Example output:

```json
[
  {
    "id": "a4a892b79a7f4c39ae316269ed919e6e",
    "title": "USERS",
    "supports_url_encoding": true
  }
]
```

✅ Make sure the namespace `USERS` exists.

---

## 👤 2. Add a Student User

Add a student with a username and password:

```sh
wrangler kv key put user:student1 '{"password":"1234"}' --binding=USERS
wrangler kv key put user:student1 --binding=USERS --value='{"password":"1234"}'
wrangler kv key put user:student1 --binding=USERS --value='{"password":"1234"}' --remote
```

* **Key:** `user:student1`
* **Value:** `{"password":"1234"}`

---

## 📋 3. List All Students

Show all stored usernames:

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

✅ With these commands, you can create, list, check, update, and delete student accounts easily.
