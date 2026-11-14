#!/usr/bin/env bash
# Выкладка сайта на хостинг Beget, адрес https://доммира.рф (xn--80ahmpakr.xn--p1ai).
# Сборка с адресом доммира.рф в canonical и sitemap.xml, открытой индексацией и сервером заявок на Vercel,
# затем загрузка по SSH-ключу. Пароль от хостинга скрипту не нужен, ключ один раз добавляет владелец:
#   ssh-keygen -t ed25519 -f ~/.ssh/dom_mira_beget -N "" -C dom-mira-deploy
#   ssh-copy-id -i ~/.ssh/dom_mira_beget.pub andre2021_s@andre2021.beget.tech
# Запуск: BEGET_DIR=<папка сайта на хостинге> bash scripts/deploy-beget.sh
# Коды подтверждения Вебмастера и Search Console: YANDEX_VERIFICATION и GOOGLE_SITE_VERIFICATION.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${BEGET_HOST:-andre2021_s@andre2021.beget.tech}"
KEY="${BEGET_KEY:-$HOME/.ssh/dom_mira_beget}"
DIR="${BEGET_DIR:?Укажите папку сайта на хостинге, например BEGET_DIR=xn--80ahmpakr.xn--p1ai/public_html}"

SITE_HOSTING=beget \
PUBLIC_SITE_URL=https://xn--80ahmpakr.xn--p1ai \
SITE_INDEXABLE=true \
VITE_API_BASE=https://dom-mira.vercel.app \
  npx vite build --outDir dist-beget --emptyOutDir

# Админка работает только на Vercel (.htaccess отправляет /admin/ туда), на хостинг её не кладём.
rm -rf dist-beget/admin
rsync -rlptz --delete --exclude admin -e "ssh -i $KEY -o IdentitiesOnly=yes" dist-beget/ "$HOST:$DIR/"
echo "Готово: https://xn--80ahmpakr.xn--p1ai/"
