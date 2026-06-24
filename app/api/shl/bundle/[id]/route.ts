// SMART Health Link Bundle Endpoint
// Returns the encrypted FHIR bundle for a given SHL
import { NextRequest, NextResponse } from 'next/server'
import { getSHLMetadata, getSHLBundle } from '@/lib/shl/generator'
import { validateToken } from '@/lib/shl/bundle-tokens'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  // Get SHL metadata to verify it exists and is active
  const metadata = await getSHLMetadata(id)
  
  if (!metadata) {
    return NextResponse.json(
      { error: 'SHL not found or expired' },
      { status: 404 }
    )
  }
  
  if (!metadata.isActive) {
    return NextResponse.json(
      { error: 'SHL has been revoked' },
      { status: 410 }
    )
  }

  // Validate the one-time token issued by the manifest endpoint
  const token = request.nextUrl.searchParams.get('token')
  if (!token || !validateToken(id, token)) {
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: 401 }
    )
  }

  // Get the encrypted bundle
  const bundle = await getSHLBundle(id)
  
  if (!bundle) {
    return NextResponse.json(
      { error: 'Bundle not found' },
      { status: 404 }
    )
  }
  
  // Return encrypted bundle
  // The consumer will decrypt using the key from the SHL URI
  return new NextResponse(bundle, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
