tsrs_editor_dir="$HOME/.local/share/foldkit-tsrs/0.18.0-ts7.1.0-dev.20260929"
mkdir -p "$tsrs_editor_dir"
npm install --prefix "$tsrs_editor_dir" --no-save --no-package-lock tsrs@0.18.0-ts7.1.0-dev.20260929
"$tsrs_editor_dir/node_modules/.bin/tsrs" --version
