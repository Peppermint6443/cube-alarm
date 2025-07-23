import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import AlarmList from './components/AlarmList';
import AlarmForm from './components/AlarmForm';
import CubeStatus from './components/CubeStatus';
import ActiveAlarm from './components/ActiveAlarm';
import './App.css';

export interface Alarm {
  id: string;
  time: string;
  label: string;
  enabled: boolean;
  days: string[];
  requires_cube_solve: boolean;
  is_active?: boolean;
}

interface CubeState {
  connected: boolean;
  solved: boolean;
  lastMove: string;
}

const App: React.FC = () => {
  // Alarm state
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [activeAlarm, setActiveAlarm] = useState<Alarm | null>(null);
  const [showAlarmForm, setShowAlarmForm] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  
  // Cube state
  const [cubeState, setCubeState] = useState<CubeState>({
    connected: false,
    solved: false,
    lastMove: ''
  });
  
  // Socket and cube visualization
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lastMove, setLastMove] = useState<string>('');
  
  const socketRef = useRef<Socket | null>(null);

  // Initialize socket connection
  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io('http://192.168.1.162:5001');
    const socket = socketRef.current;
    setSocket(socket);

    // Socket event handlers
    socket.on('connect', () => {
      console.log('Connected to alarm server');
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from alarm server');
    });

    socket.on('cube_connected', (data: { connected: boolean }) => {
      console.log('Cube connection status:', data.connected);
      setCubeState(prev => ({ ...prev, connected: data.connected }));
    });

    socket.on('cube_move', (data: { face: string; direction: string }) => {
      console.log('Cube move:', data);
      const moveStr = `${data.face}${data.direction === 'prime' ? "'" : ''}`;
      setLastMove(moveStr);
      // If we receive moves, cube must be connected
      // Don't automatically set solved=false - let solved events control this
      setCubeState(prev => ({ ...prev, connected: true, lastMove: moveStr }));
    });

    // TEMPORARILY DISABLED: WebSocket cube_solved handler for testing
    // socket.on('cube_solved', () => {
    //   console.log('🎉 Frontend: Received cube_solved event');
    //   console.log('🔄 Frontend: Setting cubeState.solved = true');
    //   setCubeState(prev => ({ ...prev, solved: true }));
    //   
    //   // If there's an active alarm that requires cube solve, stop it
    //   // But only if the alarm has been active for at least 5 seconds to prevent immediate stops
    //   if (activeAlarm && activeAlarm.requires_cube_solve) {
    //     const alarmAge = Date.now() - new Date(activeAlarm.time).getTime();
    //     if (alarmAge >= 5000) { // 5 second minimum
    //       console.log('🛑 Frontend: Stopping alarm due to cube solved after', alarmAge, 'ms');
    //       handleStopAlarm();
    //     } else {
    //       console.log('🕒 Frontend: Cube solved but alarm too new (', alarmAge, 'ms) - ignoring');
    //     }
    //   } else {
    //     console.log('ℹ️ Frontend: No active alarm requiring cube solve');
    //   }
    // });

    socket.on('alarm_triggered', (data: { alarm: Alarm, timestamp: string }) => {
      console.log('Alarm triggered:', data);
      setActiveAlarm({ ...data.alarm, is_active: true });
    });

    socket.on('alarm_stopped', () => {
      console.log('Alarm stopped');
      setActiveAlarm(null);
    });

    // Load initial alarms and cube status
    loadAlarms();
    loadCubeStatus();

    return () => {
      socket.disconnect();
    };
  }, []);

  const loadAlarms = async () => {
    try {
      console.log('Loading alarms...');
      const response = await fetch('http://192.168.1.162:5001/api/alarms');
      const data = await response.json();
      console.log('Alarms API response:', data);
      // Backend returns array directly, not wrapped in {alarms: []}
      const alarmsArray = Array.isArray(data) ? data : [];
      console.log('Setting alarms:', alarmsArray);
      setAlarms(alarmsArray);
    } catch (error) {
      console.error('Failed to load alarms:', error);
      setAlarms([]); // Set empty array on error
    }
  };

  const loadCubeStatus = async () => {
    try {
      console.log('Loading cube status...');
      const response = await fetch('http://192.168.1.162:5001/api/cube/status');
      const data = await response.json();
      console.log('Cube status API response:', data);
      setCubeState(prev => ({
        ...prev,
        connected: data.connected || false,
        solved: data.solved || false
      }));
    } catch (error) {
      console.error('Failed to load cube status:', error);
    }
  };

  const handleSaveAlarm = async (alarmData: Omit<Alarm, 'id'>) => {
    try {
      const url = editingAlarm 
        ? `http://192.168.1.162:5001/api/alarms/${editingAlarm.id}`
        : 'http://192.168.1.162:5001/api/alarms';
      
      const method = editingAlarm ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(alarmData),
      });

      if (response.ok) {
        await loadAlarms();
        setShowAlarmForm(false);
        setEditingAlarm(null);
      } else {
        console.error('Failed to save alarm');
      }
    } catch (error) {
      console.error('Failed to save alarm:', error);
    }
  };

  const handleDeleteAlarm = async (id: string) => {
    try {
      const response = await fetch(`http://192.168.1.162:5001/api/alarms/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadAlarms();
      } else {
        console.error('Failed to delete alarm');
      }
    } catch (error) {
      console.error('Failed to delete alarm:', error);
    }
  };

  const handleToggleAlarm = async (id: string, enabled: boolean) => {
    try {
      const response = await fetch(`http://192.168.1.162:5001/api/alarms/${id}/toggle`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        await loadAlarms();
      } else {
        console.error('Failed to toggle alarm');
      }
    } catch (error) {
      console.error('Failed to toggle alarm:', error);
    }
  };

  const handleStopAlarm = async () => {
    console.log('🛑 DEBUG: handleStopAlarm called!');
    console.log('🛑 DEBUG: Call stack:', new Error().stack);
    console.log('🛑 DEBUG: Current activeAlarm:', activeAlarm);
    console.log('🛑 DEBUG: Current timestamp:', new Date().toISOString());
    
    try {
      const response = await fetch('http://192.168.1.162:5001/api/alarms/stop', {
        method: 'POST',
      });
      
      if (response.ok) {
        setActiveAlarm(null);
      } else {
        console.error('Failed to stop alarm');
      }
    } catch (error) {
      console.error('Failed to stop alarm:', error);
    }
  };

  const handleResetCubeState = async () => {
    try {
      const response = await fetch('http://192.168.1.162:5001/api/cube/reset', {
        method: 'POST',
      });
      
      if (response.ok) {
        setCubeState(prev => ({ ...prev, solved: true }));
        console.log('Cube state reset to solved');
      } else {
        console.error('Failed to reset cube state');
      }
    } catch (error) {
      console.error('Failed to reset cube state:', error);
    }
  };

  const handleEditAlarm = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    setShowAlarmForm(true);
  };

  const handleAddAlarm = () => {
    setEditingAlarm(null);
    setShowAlarmForm(true);
  };

  const handleCancelForm = () => {
    setShowAlarmForm(false);
    setEditingAlarm(null);
  };

  if (activeAlarm) {
    return (
      <ActiveAlarm 
        alarm={activeAlarm}
        cubeState={cubeState}
        onStop={handleStopAlarm}
        cubeSolved={cubeState.solved}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>🧩 Rubik's Cube Alarm Clock</h1>
        <CubeStatus 
          connected={cubeState.connected}
          solved={cubeState.solved}
          lastMove={cubeState.lastMove}
          alarmCount={alarms.length}
          onResetCubeState={handleResetCubeState}
        />
      </header>

      <main className="app-main">
        <div className="cube-section">
          <h2>Cube Status</h2>
          <div className="simple-cube-display">
            <div className={`cube-status ${cubeState.connected ? 'connected' : 'disconnected'}`}>
              {cubeState.connected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            <div className={`solve-status ${cubeState.solved ? 'solved' : 'scrambled'}`}>
              {cubeState.solved ? '✅ Solved' : '🔄 Scrambled'}
            </div>
            {lastMove && (
              <div className="last-move">
                Last move: <strong>{lastMove}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="alarms-section">
          <div className="alarms-header">
            <h2>Alarms</h2>
            <button className="add-alarm-btn" onClick={handleAddAlarm}>
              + Add Alarm
            </button>
          </div>
          
          <AlarmList 
            alarms={alarms}
            onToggle={handleToggleAlarm}
            onDelete={handleDeleteAlarm}
            onEdit={handleEditAlarm}
          />
        </div>
      </main>

      {showAlarmForm && (
        <AlarmForm 
          alarm={editingAlarm || undefined}
          onSave={handleSaveAlarm}
          onCancel={handleCancelForm}
        />
      )}
    </div>
  );
};

export default App;
