import { useState } from 'react'
import { supabase } from '../supabaseClient'

export function useBankData() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [userRole, setUserRole] = useState('CLIENT')
  const [verificationStatus, setVerificationStatus] = useState('PENDING')

  const [userFullName, setUserFullName] = useState('')
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [clientTickets, setClientTickets] = useState([])

  const [allUsers, setAllUsers] = useState([])
  const [allTickets, setAllTickets] = useState([])
  const [loading, setLoading] = useState(false)

  // 🔒 Хешування пароля SHA-256
  async function hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function loadSystemData(userId, role) {
    setLoading(true)
    try {
      if (role === 'EMPLOYEE') {
        const { data: usersList } = await supabase.from('users').select('*')
        setAllUsers(usersList || [])
        const { data: ticketsList } = await supabase.from('support_tickets').select('*, users(full_name, email)').order('created_at', { ascending: false })
        setAllTickets(ticketsList || [])
      } else {
        const { data: userData } = await supabase.from('users').select('*').eq('user_id', userId).single()
        if (userData) {
          setUserFullName(userData.full_name)
          setVerificationStatus(userData.verification_status || 'PENDING')
        }
        let { data: accountData } = await supabase.from('accounts').select('balance').eq('user_id', userId).maybeSingle()
        setBalance(accountData ? Number(accountData.balance) : 5000.00)

        const { data: txList } = await supabase.from('transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        setTransactions(txList || [])
        const { data: tktList } = await supabase.from('support_tickets').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        setClientTickets(tktList || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return {
    isLoggedIn, setIsLoggedIn, authMode, setAuthMode, currentUserId, setCurrentUserId,
    userRole, setUserRole, verificationStatus, setVerificationStatus, userFullName,
    balance, setBalance, transactions, setTransactions, clientTickets, setClientTickets,
    allUsers, allTickets, loading, setLoading, hashPassword, loadSystemData
  }
}