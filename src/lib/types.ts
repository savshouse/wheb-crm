export type Profile = {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'manager' | 'staff'
  created_at: string
  updated_at: string
}

// Subset returned by join queries (select id, full_name, email)
export type BasicProfile = {
  id: string
  email: string
  full_name: string | null
}

export type Client = {
  id: string
  name: string
  industry: string | null
  status: 'prospect' | 'active' | 'inactive'
  notes: string | null
  website: string | null
  phone: string | null
  address: string | null
  account_manager_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  account_manager?: BasicProfile | null
}

export type Contact = {
  id: string
  client_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  job_title: string | null
  is_primary: boolean
  notes: string | null
  created_at: string
}

export type Meeting = {
  id: string
  client_id: string
  title: string
  meeting_date: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  creator?: BasicProfile | null
  tasks?: Task[]
}

export type Task = {
  id: string
  title: string
  description: string | null
  client_id: string
  meeting_id: string | null
  assigned_to: string | null
  created_by: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'open' | 'in_progress' | 'completed' | 'cancelled'
  completed_at: string | null
  created_at: string
  updated_at: string
  assignee?: BasicProfile | null
  creator?: BasicProfile | null
  client?: { id: string; name: string } | null
  meeting?: { id: string; title: string } | null
}

export type TaskHistoryEntry = {
  id: string
  task_id: string
  action: string
  performed_by: string | null
  from_user_id: string | null
  to_user_id: string | null
  old_value: string | null
  new_value: string | null
  note: string | null
  created_at: string
  performer?: BasicProfile | null
  from_user?: BasicProfile | null
  to_user?: BasicProfile | null
}
