#!/usr/bin/env bash
# index.html + css + js 를 한 파일(dist/my_board.html)로 합친다. (공유용 단일 페이지)
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
{
  echo '<title>회장 개인현황판</title>'
  echo '<meta name="claude:viewport-fit-sides" content="cover">'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap">'
  echo '<style>'; cat css/style.css; echo '</style>'
  sed -n '/<body>/,/<\/body>/p' index.html | sed '1d;$d' | grep -v '<script src='
  echo '<script>'; cat js/data.js; echo '</script>'
  echo '<script>'; cat js/app.js; echo '</script>'
} > dist/my_board.html
echo "built dist/my_board.html"
