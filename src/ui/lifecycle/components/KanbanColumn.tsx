import React, { useState } from 'react';
import { KanbanColumnDef, EmployeeProfile } from '../types';
import { ProfileCard } from './ProfileCard';

interface KanbanColumnProps {
  column: KanbanColumnDef;
  profiles: EmployeeProfile[];
  onMoveProfile?: (profileId: string, newStatus: string) => void;
}

export function KanbanColumn({ column, profiles, onMoveProfile }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const profileId = e.dataTransfer.getData('text/plain');
    if (profileId && onMoveProfile) {
      onMoveProfile(profileId, column.status);
    }
  };

  return (
    <div 
      className={`hr-kanban-col ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div 
        className="hr-kanban-col-header" 
        style={{ borderTopColor: column.color }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span 
            style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              backgroundColor: column.color,
              display: 'inline-block' 
            }} 
          />
          <h3 className="hr-kanban-title">{column.label}</h3>
        </div>
        <span 
          className="hr-kanban-badge" 
          style={{ 
            color: column.color, 
            backgroundColor: `${column.color}15` 
          }}
        >
          {profiles.length}
        </span>
      </div>
      
      <div className="hr-kanban-content">
        {profiles.length === 0 ? (
          <p className="empty-state">
            {isDragOver ? 'Thả thẻ vào cột này' : 'Chưa có nhân sự'}
          </p>
        ) : (
          profiles.map(p => (
            <ProfileCard 
              key={p._id} 
              profile={p} 
              onMoveProfile={onMoveProfile}
            />
          ))
        )}
      </div>
    </div>
  );
}
