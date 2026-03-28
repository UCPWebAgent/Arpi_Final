import { Page, Navbar, Block, Button, BlockTitle, f7 } from 'framework7-react'

export default function HomePage() {
  const startVoiceSession = () => {
    const sessionId = crypto.randomUUID()
    f7.views.main.router.navigate(`/voice/${sessionId}`)
  }

  const goToSearch = () => {
    f7.views.main.router.navigate('/search')
  }

  return (
    <Page name="home">
      <Navbar title="Arpi" subtitle="AI Auto Parts Clerk" />

      <Block className="text-center mt-8">
        <div className="text-6xl mb-4">🔧</div>
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
          Search Parts
        </Button>
      </Block>
    </Page>
  )
}
