import { Outlet } from 'react-router-dom';
import { ListItem, MasterDetail } from '@/components/MasterDetail';

export const DICTIONARIES = [
  { to: '/entities', label: 'Сущности' },
  { to: '/dependencies', label: 'Зависимости' },
  { to: '/adjustments', label: 'Относительные регулировки' },
  { to: '/result-codes', label: 'Result codes' },
];

/** Раздел «Справочники»: слева меню справочников, справа — выбранный справочник. */
export function DictionariesLayout() {
  return (
    <MasterDetail
      list={
        <nav aria-label="Справочники" className="py-2">
          {DICTIONARIES.map((d) => (
            <ListItem key={d.to} to={d.to}>
              {d.label}
            </ListItem>
          ))}
        </nav>
      }
    >
      <Outlet />
    </MasterDetail>
  );
}
