import { EmployeeProfile, KANBAN_COLUMNS } from '../types';
import { KanbanColumn } from './KanbanColumn';

interface KanbanBoardProps {
  profiles: EmployeeProfile[];
  isLoading: boolean;
  selectedColumnStatus?: string;
  onMoveProfile?: (profileId: string, newStatus: string) => void;
}

export function KanbanBoard({ profiles, isLoading, selectedColumnStatus = 'all', onMoveProfile }: KanbanBoardProps) {
  if (isLoading) {
    return (
      <div className="kanban-loading">
        <div className="spinner"></div>
        <p>Đang tải dữ liệu hồ sơ nhân sự...</p>
      </div>
    );
  }

  const columnsToDisplay = selectedColumnStatus === 'all'
    ? KANBAN_COLUMNS
    : KANBAN_COLUMNS.filter(col => col.status === selectedColumnStatus);

  return (
    <div className="hr-kanban-container">
      {columnsToDisplay.map(col => {
        const colStatus = (col.status || '').trim().toLowerCase();
        return (
          <KanbanColumn 
            key={col.status}
            column={col} 
            profiles={profiles.filter(p => (p.status || '').trim().toLowerCase() === colStatus)}
            onMoveProfile={onMoveProfile}
          />
        );
      })}
    </div>
  );
}
