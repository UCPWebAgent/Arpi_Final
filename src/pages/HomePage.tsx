import { Page, Navbar, NavRight, Link, Block, Button, BlockTitle, f7 } from 'framework7-react'
import { useAuth }  from '../context/authStore'
import { useOrder } from '../context/orderStore'

export default function HomePage() {
  const { mechanic, logout }  = useAuth()
  const { createSession }     = useOrder()

  const startVoiceSession = () => {
    const sessionId = crypto.randomUUID()
    createSession(sessionId)   // fire-and-forget — do not block navigation
    f7.views.main.router.navigate(`/voice/${sessionId}`)
  }

  const goToSearch = () => {
    f7.views.main.router.navigate('/search')
  }

  return (
    <Page name="home">
      <Navbar title="Arpi" subtitle={mechanic ? mechanic.name : ''}>
        <NavRight>
          <Link onClick={logout} iconF7="square_arrow_right" tooltip="Sign out" />
        </NavRight>
      </Navbar>

      <Block className="text-center mt-8">
        <div style={{ fontSize: 56 }} className="mb-4">🔧</div>
        <BlockTitle large>Welcome to Arpi</BlockTitle>
        <p className="text-gray-500 mb-8">
          Your bilingual AI auto parts counter clerk.
          <br />
          Habla español también.
        </p>

        <Button
          fill
          large
          color="red"
          className="mb-4"
          onClick={startVoiceSession}
        >
          Start Voice Session
        </Button>

        <Button
          outline
          large
          color="red"
          onClick={goToSearch}
        >
          Search Orders
        </Button>
      </Block>
    </Page>
  )
}
