import { Page, Navbar, Block, BlockTitle, NavLeft, Link } from 'framework7-react'

interface SummaryPageProps {
  f7route: { params: { sessionId: string } }
}

export default function SummaryPage({ f7route }: SummaryPageProps) {
  const { sessionId } = f7route.params

  return (
    <Page name="summary">
      <Navbar title="Session Summary">
        <NavLeft>
          <Link back iconF7="chevron_left" text="Back" />
        </NavLeft>
      </Navbar>

      <Block className="text-center mt-8">
        <div className="text-6xl mb-4">📋</div>
        <BlockTitle>Order Summary</BlockTitle>
        <p className="text-gray-500 text-sm mb-2">Session ID: {sessionId}</p>
        <p className="text-gray-400">
          Phase 2 — Order review &amp; confirmation coming soon.
        </p>
      </Block>
    </Page>
  )
}
