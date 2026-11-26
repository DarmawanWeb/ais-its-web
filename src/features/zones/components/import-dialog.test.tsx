import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { ImportDialog, type ImportedZone } from './import-dialog';

function geojsonFile(content: unknown, name = 'zona.geojson') {
  return new File([JSON.stringify(content)], name, { type: 'application/geo+json' });
}

describe('GeoJSON import dialog', () => {
  it('refuses swapped coordinates with a hint and keeps the import disabled', async () => {
    const onImport = vi.fn();
    renderWithProviders(<ImportDialog open onOpenChange={() => undefined} onImport={onImport} />);
    await userEvent.upload(
      screen.getByTestId('zone-import-input'),
      geojsonFile({ type: 'Point', coordinates: [1.16, 104.02] }, 'tertukar.geojson'),
    );
    expect(await screen.findByText('Lintang dan bujur tertukar?')).toBeInTheDocument();
    expect(screen.getByText('tertukar.geojson')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Buka di editor' })).toBeDisabled();
    expect(onImport).not.toHaveBeenCalled();
  });

  it('summarizes a valid feature collection and hands it to the editor', async () => {
    const onImport = vi.fn<(zone: ImportedZone) => void>();
    renderWithProviders(<ImportDialog open onOpenChange={() => undefined} onImport={onImport} />);
    await userEvent.upload(
      screen.getByTestId('zone-import-input'),
      geojsonFile({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { name: 'Area labuh baru', kind: 'anchorage', bufferM: 300 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [104.0, 1.1],
                  [104.1, 1.1],
                  [104.1, 1.2],
                  [104.0, 1.1],
                ],
              ],
            },
          },
        ],
      }),
    );
    const summary = await screen.findByRole('status');
    expect(summary).toHaveTextContent('Polygon');
    expect(summary).toHaveTextContent('Area labuh baru');
    await userEvent.click(screen.getByRole('button', { name: 'Buka di editor' }));
    expect(onImport).toHaveBeenCalledTimes(1);
    const imported = onImport.mock.calls[0]?.[0];
    expect(imported?.geometry.type).toBe('Polygon');
    expect(imported?.properties).toMatchObject({ name: 'Area labuh baru', kind: 'anchorage' });
  });

  it('explains text that is not JSON', async () => {
    renderWithProviders(
      <ImportDialog open onOpenChange={() => undefined} onImport={() => undefined} />,
    );
    await userEvent.click(screen.getByText('Atau tempel teks GeoJSON', { selector: 'summary' }));
    await userEvent.type(screen.getByRole('textbox'), 'bukan json');
    await userEvent.click(screen.getByRole('button', { name: 'Periksa' }));
    expect(await screen.findByText('Bukan JSON yang valid')).toBeInTheDocument();
  });
});
