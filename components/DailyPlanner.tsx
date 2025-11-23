
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Check, CheckSquare, StickyNote, Sparkles, ChevronRight, ChevronLeft, Calendar, Send, Bot, User, ListPlus, Box, FileText, Zap, Eraser, MessageSquare, BarChart3, TrendingUp } from 'lucide-react';
import { BillData, PackingStatus } from '../types';
import { sendGeminiChat } from '../services/geminiService';

interface Task {
  id: string;
  text: string;
  completed: boolean;
}

interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: number;
}

interface DailyPlannerProps {
  date: string;
  onClose: () => void;
  bills: BillData[]; // Today's bills
  allBills: BillData[]; // Full history
  onDateChange: (newDate: string) => void;
  onQuickAdd: (data: { customerName: string; invoiceNo: string; boxCount: number; description: string }) => void;
}

const STORAGE_KEY_TASKS = 'grace_planner_data';
const STORAGE_KEY_CHAT = 'grace_chat_history';

const DailyPlanner: React.FC<DailyPlannerProps> = ({ date, onClose, bills, allBills, onDateChange, onQuickAdd }) => {
  const [activeTab, setActiveTab] = useState<'todo' | 'notes' | 'quick' | 'chat' | 'stats'>('todo');
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [note, setNote] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  
  const [newTaskInput, setNewTaskInput] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [quickForm, setQuickForm] = useState({ name: '', invoice: '', boxes: '1', shop: '' });

  // Load local data
  useEffect(() => {
    try {
      const allData = JSON.parse(localStorage.getItem(STORAGE_KEY_TASKS) || '{}');
      const dayData = allData[date] || { tasks: [], note: '' };
      setTasks(dayData.tasks || []);
      setNote(dayData.note || '');
      
      const chatData = JSON.parse(localStorage.getItem(STORAGE_KEY_CHAT) || '[]');
      setChatHistory(chatData);

    } catch (e) { console.error("Load Error", e); }
  }, [date]);

  // Save local data
  useEffect(() => {
    const timer = setTimeout(() => {
        const allData = JSON.parse(localStorage.getItem(STORAGE_KEY_TASKS) || '{}');
        allData[date] = { tasks, note };
        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(allData));
    }, 500);
    return () => clearTimeout(timer);
  }, [tasks, note, date]);

  useEffect(() => {
      localStorage.setItem(STORAGE_KEY_CHAT, JSON.stringify(chatHistory));
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleDateNav = (dir: number) => {
      const d = new Date(date);
      d.setDate(d.getDate() + dir);
      onDateChange(d.toISOString().split('T')[0]);
  };

  const addTask = () => {
    if (!newTaskInput.trim()) return;
    setTasks(prev => [{ id: Date.now().toString(), text: newTaskInput.trim(), completed: false }, ...prev]);
    setNewTaskInput('');
  };

  const toggleTask = (id: string) => setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  const deleteTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));

  const handleQuickSubmit = () => {
      if (!quickForm.name) return;
      onQuickAdd({
          customerName: quickForm.name,
          invoiceNo: quickForm.invoice,
          boxCount: parseInt(quickForm.boxes) || 0,
          description: quickForm.shop
      });
      setQuickForm({ name: '', invoice: '', boxes: '1', shop: '' });
      setActiveTab('todo');
  };

  const handleSendChat = async () => {
      if (!chatInput.trim()) return;
      
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: chatInput, timestamp: Date.now() };
      setChatHistory(prev => [...prev, userMsg]);
      setChatInput('');
      setIsChatLoading(true);

      const context = `
        Current Date: ${date}
        Bills Logged Today: ${bills.length}
        Already Packed Today: ${bills.filter(b => b.status === PackingStatus.PACKED).length}
        Pending Packing Today: ${bills.filter(b => b.status === PackingStatus.PENDING).length}
        Total Active Tasks: ${tasks.filter(t => !t.completed).map(t => t.text).join(', ')}
        Notes: ${note}
      `;

      const apiHistory = chatHistory.slice(-10).map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
      }));

      const responseText = await sendGeminiChat(apiHistory, userMsg.text, context);
      
      const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      setChatHistory(prev => [...prev, botMsg]);
      setIsChatLoading(false);
  };

  const clearChat = () => {
      if(window.confirm("Clear chat history?")) {
          setChatHistory([]);
      }
  }

  const generateReport = () => {
      const total = bills.length;
      const packed = bills.filter(b => b.status === PackingStatus.PACKED).length;
      const summary = `📅 *Update ${date}*\nTotal: ${total} | Packed: ${packed}\nPending: ${total - packed}`;
      setNote(prev => summary + '\n\n' + prev);
      setActiveTab('notes');
  };

  // --- STATS CALCULATION ---
  const getLast7DaysStats = () => {
      const stats = [];
      const today = new Date();
      for (let i = 6; i >= 0; i--) {
          const d = new Date(today);
          d.setDate(today.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          
          const dayBills = allBills.filter(b => b.entryDate === dateStr);
          const packed = dayBills.filter(b => b.status === PackingStatus.PACKED).length;
          const total = dayBills.length;
          
          stats.push({
              day: d.toLocaleDateString('en-US', { weekday: 'short' }),
              date: dateStr,
              packed,
              pending: total - packed,
              total
          });
      }
      return stats;
  };

  const weeklyStats = getLast7DaysStats();
  const maxVal = Math.max(...weeklyStats.map(s => s.total), 5); // Avoid div by zero, min scale of 5

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-md flex justify-center items-end sm:items-center p-0 sm:p-4"
    >
      <motion.div 
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-[#F8F9FA] w-full max-w-lg h-[90vh] sm:h-[85vh] sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        
        {/* HEADER */}
        <div className="bg-white border-b border-gray-200 px-5 py-4 sticky top-0 z-10 flex justify-between items-center shadow-sm">
           <div>
              <h2 className="text-xl font-black text-black tracking-tight">Daily Hub</h2>
              <p className="text-xs text-gray-400 font-medium">Plan, Track, Analyze</p>
           </div>
           
           <div className="flex items-center gap-3">
              <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button onClick={() => handleDateNav(-1)} className="p-1.5 hover:bg-white rounded-md transition-all"><ChevronLeft size={16}/></button>
                  <span className="text-xs font-bold px-2">{new Date(date).toLocaleDateString(undefined, {weekday:'short', day:'numeric'})}</span>
                  <button onClick={() => handleDateNav(1)} className="p-1.5 hover:bg-white rounded-md transition-all"><ChevronRight size={16}/></button>
              </div>
              <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 text-gray-600 transition-colors"><X size={20}/></button>
           </div>
        </div>

        {/* TABS */}
        <div className="flex p-1 mx-4 mt-4 bg-gray-200/50 rounded-xl overflow-x-auto">
            {[
                { id: 'todo', icon: CheckSquare, label: 'Tasks' },
                { id: 'stats', icon: BarChart3, label: 'Stats' },
                { id: 'quick', icon: Zap, label: 'Quick' },
                { id: 'notes', icon: StickyNote, label: 'Notes' },
                { id: 'chat', icon: MessageSquare, label: 'Chat' },
            ].map(tab => (
                <button 
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 min-w-[60px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 py-2 sm:py-2.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-200 ${activeTab === tab.id ? 'bg-white text-black shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <tab.icon size={14} className={activeTab === tab.id ? 'text-indigo-600' : ''} />
                    {tab.label}
                </button>
            ))}
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 relative">
            <AnimatePresence mode="wait">
                
                {activeTab === 'todo' && (
                    <motion.div key="todo" initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} exit={{opacity:0, x:10}} className="space-y-4 h-full flex flex-col">
                        <div className="relative group">
                            <input 
                                value={newTaskInput} onChange={(e) => setNewTaskInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTask()}
                                placeholder="What needs to be done?" 
                                className="w-full pl-4 pr-12 py-3.5 bg-white rounded-xl border border-gray-200 shadow-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none font-medium transition-all"
                            />
                            <button onClick={addTask} className="absolute right-2 top-2 p-1.5 bg-black text-white rounded-lg hover:scale-105 transition-transform"><Plus size={18}/></button>
                        </div>
                        <div className="space-y-2 flex-1 overflow-y-auto">
                            {tasks.map(t => (
                                <motion.div layout initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} key={t.id} className="group flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                                    <button onClick={() => toggleTask(t.id)} className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${t.completed ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 hover:border-gray-400'}`}>
                                        <Check size={12} strokeWidth={4}/>
                                    </button>
                                    <span className={`flex-1 text-sm font-medium transition-all ${t.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{t.text}</span>
                                    <button onClick={() => deleteTask(t.id)} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={16}/></button>
                                </motion.div>
                            ))}
                            {tasks.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                    <CheckSquare size={40} className="mb-2 opacity-20"/>
                                    <p className="text-xs font-bold opacity-50">No tasks yet</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'stats' && (
                    <motion.div key="stats" initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} exit={{opacity:0, x:10}} className="space-y-6">
                        {/* Weekly Chart */}
                        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                            <h3 className="text-sm font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <TrendingUp size={16} className="text-indigo-500"/> 
                                Weekly Packing History
                            </h3>
                            <div className="flex items-end gap-2 h-40 pb-2">
                                {weeklyStats.map((stat, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                                        <div className="w-full bg-gray-100 rounded-t-lg relative overflow-hidden flex flex-col justify-end transition-all hover:bg-gray-200" style={{ height: `${Math.max(10, (stat.total / maxVal) * 100)}%` }}>
                                            {/* Packed Portion */}
                                            <div 
                                                className="w-full bg-green-500/80 transition-all absolute bottom-0 inset-x-0" 
                                                style={{ height: stat.total > 0 ? `${(stat.packed / stat.total) * 100}%` : '0%' }}
                                            />
                                        </div>
                                        {/* Exact Data Label */}
                                        <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none shadow-sm">
                                            {stat.packed}/{stat.total}
                                        </div>
                                        {/* Always visible small count */}
                                        {stat.total > 0 && (
                                           <div className="absolute bottom-full mb-0.5 text-[9px] font-bold text-gray-400 group-hover:opacity-0 transition-opacity">{stat.total}</div>
                                        )}
                                        <span className={`text-[10px] font-bold ${stat.date === date ? 'text-indigo-600 bg-indigo-50 px-1.5 rounded' : 'text-gray-400'}`}>
                                            {stat.day}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-green-50 p-4 rounded-2xl border border-green-100 relative overflow-hidden">
                                <div className="absolute right-0 top-0 opacity-10 p-2"><Check size={48}/></div>
                                <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-1">Total Packed</p>
                                <p className="text-3xl font-black text-green-900">
                                    {allBills.filter(b => b.status === PackingStatus.PACKED).length}
                                </p>
                            </div>
                             <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100 relative overflow-hidden">
                                <div className="absolute right-0 top-0 opacity-10 p-2"><Box size={48}/></div>
                                <p className="text-[10px] font-bold text-orange-700 uppercase tracking-wider mb-1">Total Pending</p>
                                <p className="text-3xl font-black text-orange-900">
                                    {allBills.filter(b => b.status === PackingStatus.PENDING).length}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'quick' && (
                    <motion.div key="quick" initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} exit={{opacity:0, x:10}} className="space-y-5">
                        <div className="bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100 text-center">
                            <h3 className="font-bold text-indigo-900 text-sm mb-1">Manual Entry</h3>
                            <p className="text-xs text-indigo-700/70">Add a record without an image</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 mb-1 block">Customer / Shop</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3.5 text-gray-400" size={16}/>
                                    <input 
                                        value={quickForm.name} onChange={e => setQuickForm({...quickForm, name: e.target.value})}
                                        className="w-full pl-10 p-3 bg-white border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        placeholder="Name..."
                                    />
                                </div>
                            </div>
                            
                            <div className="flex gap-3">
                                <div className="flex-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 mb-1 block">Invoice #</label>
                                    <div className="relative">
                                        <FileText className="absolute left-3 top-3.5 text-gray-400" size={16}/>
                                        <input 
                                            value={quickForm.invoice} onChange={e => setQuickForm({...quickForm, invoice: e.target.value})}
                                            className="w-full pl-10 p-3 bg-white border border-gray-200 rounded-xl font-mono text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                            placeholder="000"
                                        />
                                    </div>
                                </div>
                                <div className="w-24">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider ml-1 mb-1 block">Boxes</label>
                                    <div className="relative">
                                        <Box className="absolute left-3 top-3.5 text-gray-400" size={16}/>
                                        <input 
                                            type="number"
                                            value={quickForm.boxes} onChange={e => setQuickForm({...quickForm, boxes: e.target.value})}
                                            className="w-full pl-10 p-3 bg-white border border-gray-200 rounded-xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button 
                            onClick={handleQuickSubmit}
                            className="w-full py-4 bg-black text-white rounded-xl font-bold shadow-lg shadow-black/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4 hover:bg-gray-900"
                        >
                            <ListPlus size={18}/> Add Entry
                        </button>
                    </motion.div>
                )}

                {activeTab === 'notes' && (
                    <motion.div key="notes" initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} exit={{opacity:0, x:10}} className="h-full flex flex-col space-y-3">
                        <button onClick={generateReport} className="py-2.5 px-3 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 border border-yellow-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 w-full transition-colors">
                            <Sparkles size={14}/> Auto-Generate Day Summary
                        </button>
                        <div className="flex-1 relative">
                            <textarea 
                                value={note} onChange={e => setNote(e.target.value)}
                                className="w-full h-full p-4 bg-yellow-50/50 border border-yellow-100 rounded-2xl resize-none outline-none text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:bg-yellow-50 transition-colors"
                                placeholder="Write your daily notes, reminders, or report here..."
                            />
                        </div>
                    </motion.div>
                )}

                {activeTab === 'chat' && (
                    <motion.div key="chat" initial={{opacity:0, x:-10}} animate={{opacity:1, x:0}} exit={{opacity:0, x:10}} className="flex flex-col h-full -m-4">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                            {chatHistory.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full text-gray-300 pb-10">
                                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
                                        <Bot size={32} className="text-indigo-500"/>
                                    </div>
                                    <p className="text-sm font-bold text-gray-400">"How many boxes pending today?"</p>
                                </div>
                            )}
                            {chatHistory.map(msg => (
                                <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm ${
                                        msg.role === 'user' 
                                        ? 'bg-black text-white rounded-br-none' 
                                        : 'bg-white border border-gray-100 text-gray-800 rounded-bl-none'
                                    }`}>
                                        {msg.text}
                                    </div>
                                </motion.div>
                            ))}
                            {isChatLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm flex gap-1 items-center">
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'0s'}}></div>
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'0.1s'}}></div>
                                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:'0.2s'}}></div>
                                    </div>
                                </div>
                            )}
                            <div ref={chatEndRef}/>
                        </div>
                        
                        <div className="p-3 bg-white border-t border-gray-200 flex gap-2 items-center shadow-[0_-5px_20px_rgba(0,0,0,0.02)]">
                             <button onClick={clearChat} className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Clear History">
                                <Eraser size={20}/>
                             </button>
                            <div className="flex-1 relative">
                                <input 
                                    value={chatInput} onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                                    placeholder="Ask Grace..."
                                    className="w-full bg-gray-100 border border-transparent focus:bg-white focus:border-gray-200 rounded-xl pl-4 pr-10 py-3 text-sm focus:ring-2 focus:ring-indigo-500/10 outline-none transition-all"
                                />
                                <button onClick={handleSendChat} disabled={!chatInput.trim()} className="absolute right-1 top-1 p-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                                    <Send size={16}/>
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default DailyPlanner;
