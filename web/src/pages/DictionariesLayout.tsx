import { Outlet } from 'react-router-dom';
import { ListItem, MasterDetail } from '@/components/MasterDetail';
import { usePath } from '@/hooks/project';

export const DICTIONARIES = [
  { to: '/entities', label: 'Сущности' },
  { to: '/dependencies', label: 'Зависимости' },
];

/** Раздел «Справочники»: слева меню справочников, справа — выбранный справочник. */
export function DictionariesLayout() {
  const path = usePath();
  return (
    <MasterDetail
      list={
        <nav aria-label="Справочники" className="py-2">
          {DICTIONARIES.map((d) => (
            <ListItem key={d.to} to={path(d.to)}>
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
