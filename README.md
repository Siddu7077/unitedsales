# Daily Sales Dashboard

React + Tailwind frontend, PHP API, MySQL database. Enter each day's sales in a form, then see them as charts on the dashboard.

## What you need installed
- Node.js 18+
- PHP 8.0+ (with the `pdo_mysql` extension)
- MySQL or MariaDB (XAMPP, Laragon or MAMP include PHP and MySQL)

## 1. Create the database
Open phpMyAdmin (or the MySQL command line) and run `database/schema.sql`:

    mysql -u root -p < database/schema.sql

## 2. Set your database login
Edit `api/config.php` and put in your MySQL user and password.

## 3. Run it (development)
Open two terminals in this folder.

Terminal 1, the PHP API:

    php -S localhost:8000

Terminal 2, the website:

    npm install
    npm run dev

Open http://localhost:5173

## Pages
- **Dashboard** – pick a range (This week, Last week, Fortnight, 1 month, 3 months, 6 months, 1 year) and a category (Total, Fuel, Shop, Tobacco, Pie Face, BBQ gas, Tobacco qty, or Compare all). Shows totals, daily average, best day and a breakdown chart.
- **Add entry** – pick a date and fill in the form. Saving a date that already exists updates it, so you can fix mistakes.
- **History** – every entry, newest first, filter by date range, with Edit and Delete.

## Putting it on a real website
1. Run `npm run build`. This creates a `dist/` folder.
2. Upload the *contents* of `dist/` to your web host's public folder.
3. Upload the `api/` folder next to it, so `/api/entries.php` works.
4. Create the database on the host, import `schema.sql`, and edit `api/config.php`.

## Keeping the data private
Anyone who can open the site can see and change the data. Before putting it online:
- Set `api_pin` in `api/config.php`. The API then rejects requests that do not send the matching PIN.
  To use it, open the site, press F12, go to Console and run
  `localStorage.setItem('sales_pin','YOUR-PIN')`, then reload. A proper login screen can be added later.
- Or protect the whole folder with your host's password protection (for example cPanel "Directory Privacy").

## Notes
- One entry per date. Weeks run Monday to Sunday.
- "Total sales" is entered by you (it is not calculated), because your total includes things not listed separately.
- Days with no entry show as gaps in the charts.
