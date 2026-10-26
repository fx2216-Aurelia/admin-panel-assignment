// app/login/page.tsx
'use client'
import { createClient } from '@/utils/supabase/client'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'

export default function LoginPage() {
    const supabase = createClient()
    return (
        <div className="max-w-md mx-auto mt-20">
            <Auth
                supabaseClient={supabase}
                appearance={{ theme: ThemeSupa }}
                providers={['google']} // 如果你启用了 Google 登录
            />
        </div>
    )
}