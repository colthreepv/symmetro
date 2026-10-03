# Symmetro

Protect text or recreate numbered passwords in one offline HTML file.

[Try Symmetro](https://colthreepv.github.io/symmetro/) ·
[Download an offline release](https://github.com/colthreepv/symmetro/releases)

## Use it offline

Download the HTML file attached to a release and open it in a modern browser.
The file contains everything the app needs; no server or internet connection is
required. Documentation links open external websites only when you follow them.

Choose a tool:

- **Encrypt:** protect text with a password, then save the encrypted result and keep the password separately
- **Decrypt:** recover your text with the same password. Existing Symmetro encrypted text remains supported
- **Derive:** enter a secret and a password number to recreate a numbered password. The same secret, recipe version, and number always give the same result

## Numbered passwords

Keep track of which number you use for each purpose. There are no service names,
accounts, saved profiles, or saved password lists. To reproduce a password later,
you need the exact same secret, recipe version, and number.

The secret field accepts **one line of text**. Spaces, capitalization, and exact
characters matter. Multiline paste and drop are rejected rather than silently
changing your secret. Generated passwords have 43 characters and may not fit
every service's password rules.

Use **Copy** to copy a result, or select it manually if your browser does not
allow clipboard access. Switching tools and reloading clear the fields. The app
does not save your secrets or your number-to-purpose mapping.

## Keep your data safe

- Use a long, unpredictable, unique secret. Generating a long password does not make a weak secret safe
- Identical inputs produce identical numbered passwords for everyone. Someone who knows one generated password can try guesses of your secret offline; a correct guess reveals all passwords derived from that secret
- There is no account, password reset, or recovery service. You are responsible for remembering the original password or secret and any numbered-password mapping
- Processing happens in your browser, without telemetry or a backend. Use a device and browser you trust, and work offline when handling sensitive information
- Clearing fields cannot erase clipboard history or guarantee erasure from browser memory. Extensions and other software are outside the app's control

## Verify your download

Release files include GitHub build attestations, which identify the source
commit and workflow that produced the file. If you have the GitHub CLI, verify
your downloaded file with:

```sh
gh attestation verify index.html -R colthreepv/symmetro
```

Replace `index.html` with the actual downloaded filename. This checks the file's
provenance and integrity; it is not a security audit or a guarantee that the
software is safe. Verify downloads before using them for sensitive information.

## Development

For setup, builds, tests, and contribution details, see [DEV.md](DEV.md).
