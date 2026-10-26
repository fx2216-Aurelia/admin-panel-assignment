'use client'
import { createClient } from '@/utils/supabase/client'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'

export default function LoginPage() {
    const supabase = createClient()

    // 获取当前域名（自动适应本地或 Vercel）
    const getBaseUrl = () => {
        if (typeof window !== 'undefined') return window.location.origin
        return 'http://localhost:3000'
    }

    return (
        <div className="max-w-md mx-auto mt-20">
            <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                providers={['google']}
                // 关键点：登录成功后跳转到 /admin
                redirectTo={`${getBaseUrl()}/auth/callback`}
            />
        </div>
    )
}