import { useState } from 'react';
import Dashboard from './components/Dashboard.jsx';
import EntryForm from './components/EntryForm.jsx';
import History from './components/History.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'add', label: 'Add entry', icon: '✏️' },
  { id: 'history', label: 'History', icon: '🗓️' },
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [editDate, setEditDate] = useState(null);

  const editEntry = (date) => {
    setEditDate(date);
    setTab('add');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-orange-400 text-xl shadow-lg shadow-indigo-200">
            ⛽
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Daily Sales</h1>
            <p className="text-sm text-slate-500">Fuel · Shop · Tobacco · Pie Face</p>
          </div>
        </div>
        <nav className="flex gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (t.id !== 'add') setEditDate(null);
                setTab(t.id);
              }}
              className={`pill ${
                tab === t.id
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="mr-1.5">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'dashboard' && <Dashboard onAdd={() => setTab('add')} />}
      {tab === 'add' && (
        <EntryForm
          initialDate={editDate}
          onSaved={() => {
            setEditDate(null);
            setTab('dashboard');
          }}
        />
      )}
      {tab === 'history' && <History onEdit={editEntry} />}
    </div>
  );
}
