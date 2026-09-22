import { taxReportCoretaxFakturControllerExportFakturV1 } from '#lib/api/generated/tax-reports/tax-reports';
import { saveBlobFile } from '#lib/shared/save-blob-file';

type DownloadCoretaxFakturXmlParams = {
  reportId: string;
  period: string;
};

/**
 * Saves a finalized PPN keluaran month as DJP's Faktur Keluaran v1.6 XML
 * (P27-T09), for the clinic to import in Coretax. The API audits the download
 * as an export and as a patient identifier unmask: the file carries NIKs.
 */
export async function downloadCoretaxFakturXml({
  reportId,
  period,
}: DownloadCoretaxFakturXmlParams): Promise<void> {
  const response = await taxReportCoretaxFakturControllerExportFakturV1(reportId);
  saveBlobFile({ blob: response.data, fileName: `coretax-faktur-keluaran-${period}-v1_6.xml` });
}
