# Symmetro

Protect text with a password, directly in your browser.

[Try Symmetro](https://colthreepv.github.io/symmetro/) ·
[Download an offline release](https://github.com/colthreepv/symmetro/releases)

## Use it offline

1. Download the HTML file attached to a release
2. Open that file in a modern browser; it does not need a server or an internet connection
3. Choose **Encrypt**, enter your text and a password, and save the encrypted result
4. To read it again, choose **Decrypt** and enter the encrypted text and the same password

The downloaded app is one self-contained HTML file. Keep a copy of that file and
your encrypted text. Documentation links open external websites only when you
follow them.

## Keep your data safe

- Use a long, unpredictable password and keep it separately from the encrypted text
- There is no account, password reset, or recovery service. A forgotten password cannot be recovered by the app
- Processing happens in your browser. Use a device and browser you trust, and work offline when handling sensitive text
- Browser extensions, other software, and clipboard history are outside the app's control

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

## Demo

![Demo of the encryption interface](https://github.com/user-attachments/assets/0ff6774f-5929-4d05-bc26-92e8272e39b4)
