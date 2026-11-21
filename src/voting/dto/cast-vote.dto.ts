import { IsUUID } from 'class-validator';

const MSG_OPTION = 'Selecciona una opción.';

/** Cuerpo de POST /asambleas/temas/:temaId/votos (H23). */
export class CastVoteDto {
  @IsUUID('all', { message: MSG_OPTION })
  optionId!: string;
}
