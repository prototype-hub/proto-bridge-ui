#!/bin/sh
set -eu

: "${API_BASE_PATH:?Set API_BASE_PATH to the backend URL reachable from this container}"
SERVER_NAME=${SERVER_NAME:-}

#NAMESERVERS=$(cat /etc/resolv.conf | grep "nameserver" | awk '{print $2}' | tr '\n' ' ')
NAMESERVERS=$(grep "^nameserver" /etc/resolv.conf | awk '{print $2}' | tr '\n' ' ')
case "$API_BASE_PATH" in
    http://*|https://*) ;;
    *) echo "API_BASE_PATH must be an http(s) URL" >&2; exit 1 ;;
esac

apiUrl="proxy_pass  $API_BASE_PATH\$1;"
resolver="resolver $NAMESERVERS ipv6=off;"

sed -i '11c '"$resolver"'' /etc/nginx/conf.d/default.conf
sed -i "s%{API_BASE_PATH}%$API_BASE_PATH%g" /etc/nginx/conf.d/default.conf

if [ -z "$SERVER_NAME" ]; then
    serverName="server_name localhost;"
    sed -i '4c '"$serverName"'' /etc/nginx/conf.d/default.conf
    sed -i "s%{SERVER_NAME}%\"0\"%g" /etc/nginx/conf.d/default.conf
else
    serverName="server_name $SERVER_NAME;"
    sed -i '4c '"$serverName"'' /etc/nginx/conf.d/default.conf
    sed -i "s%{SERVER_NAME}%$SERVER_NAME%g" /etc/nginx/conf.d/default.conf
fi

#cat /etc/nginx/conf.d/default.conf

nginx -g "daemon off;"

