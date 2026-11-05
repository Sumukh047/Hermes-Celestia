import asyncio, httpx

async def main():
    async with httpx.AsyncClient(timeout=12, headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}) as c:
        r = await c.post('https://html.duckduckgo.com/html/', data={'q':'AI Agents'})
        with open('ddg.html', 'w', encoding='utf-8') as f:
            f.write(r.text)

asyncio.run(main())
