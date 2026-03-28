import { Page, Navbar, Block, BlockTitle, Searchbar, NavLeft, Link } from 'framework7-react'

export default function SearchPage() {
  return (
    <Page name="search">
      <Navbar title="Part Search">
        <NavLeft>
          <Link back iconF7="chevron_left" text="Back" />
        </NavLeft>
      </Navbar>

      <Block>
        <Searchbar
          placeholder="Search parts by name or number..."
          disableButton={false}
        />
      </Block>

      <Block className="text-center mt-4">
        <div className="text-6xl mb-4">🔍</div>
        <BlockTitle>Search Parts</BlockTitle>
        <p className="text-gray-400">
          Phase 2 — Catalog search coming soon.
        </p>
      </Block>
    </Page>
  )
}
