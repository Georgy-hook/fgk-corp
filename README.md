# FGK Corp

Каталог цифровых 3D-моделей. Первый экспонат — реконструкция БТС-001 с ВДНХ в масштабе 1:144. На странице модели можно осмотреть её в 3D, выбрать окрас и скачать файлы для печати.

- [Витрина](https://georgy-hook.github.io/fgk-corp/)
- [Админка](https://georgy-hook.github.io/fgk-corp/admin/)
- [Публикации](https://github.com/Georgy-hook/fgk-corp/actions)

## Публикация модели

1. Откройте админку и войдите с [fine-grained токеном GitHub](https://github.com/settings/personal-access-tokens/new?name=FGK+Corp+Catalog&target_name=Georgy-hook&expires_in=30&contents=write). Укажите владельца `Georgy-hook`, выберите только репозиторий `fgk-corp` и дайте ему разрешение **Contents → Read and write**. Токен живёт в памяти текущей вкладки.
2. Добавьте название, категорию, описание, обложку и файлы STL. Для предварительного просмотра собранной модели из нескольких деталей добавьте GLB. Окрасы задаются в карточке товара.
3. Нажмите «Опубликовать». После проверки каталога GitHub Actions обновит витрину.

Если удобнее работать через Git, добавьте каталог `catalog/<slug>/` с `product.json` и файлами модели, затем впишите slug в `catalog/index.json`. Для отдельных STL-файлов используйте `stl: [{ "file": "model.stl", "label": "Скачать STL" }]`. Путь к GLB хранится в `glb`, пути к изображениям — в `image` и `gallery`. Пример карточки с отдельной 3D-сценой находится в `catalog/buran-vdnh/product.json`. При публикации проверка собирает карточки в один JSON, который витрина загружает одним запросом.

## Заявки

Посетитель оставляет имя и контакт в Telegram, ВКонтакте или по почте. Заявки обрабатывает [проект Netlify Forms](https://app.netlify.com/projects/fgk-corp-orders/forms). Оплата и детали согласуются в переписке.

В админке откройте раздел почты, укажите новый адрес и введите [токен Netlify с коротким сроком действия](https://app.netlify.com/user/applications#personal-access-tokens). Токен нужен только для запроса к Netlify. Новый получатель может получить письмо с подтверждением адреса от Netlify. Адрес хранится в настройках уведомления Netlify.

Описание формы для Netlify лежит в `order-relay/public`. После изменения её полей разверните эту папку на существующем проекте `fgk-corp-orders` с включённой обработкой форм и обновите поля в `assets/orders.js`.

## Локальный запуск

```sh
python3 scripts/check-catalog.py
python3 -m http.server 8080
```

Откройте http://localhost:8080. Публикация работает через GitHub Actions. Производственная форма ограничена по CORS доменом GitHub Pages.
